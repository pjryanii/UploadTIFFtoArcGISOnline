require([
  "esri/identity/OAuthInfo",
  "esri/identity/IdentityManager",
  "esri/portal/Portal",
  "esri/request"
], function (OAuthInfo, esriId, Portal, esriRequest) {
  "use strict";

  const config = window.APP_CONFIG;
  const signInButton = document.getElementById("signInButton");
  const signOutButton = document.getElementById("signOutButton");
  const userLabel = document.getElementById("userLabel");
  const fileInput = document.getElementById("fileInput");
  const sourceTitle = document.getElementById("sourceTitle");
  const deleteSource = document.getElementById("deleteSource");
  const publishButton = document.getElementById("publishButton");
  const progress = document.getElementById("progress");
  const statusNode = document.getElementById("status");
  const detailsNode = document.getElementById("details");
  const resultLinks = document.getElementById("resultLinks");

  let portal = null;
  let credential = null;
  let busy = false;

  assertConfigured();

  const oauthInfo = new OAuthInfo({
    appId: config.clientId,
    portalUrl: config.portalUrl,
    popup: true,
    flowType: "authorization-code",
    popupCallbackUrl:
      window.location.origin +
      "/UploadTIFFtoArcGISOnline/oauth-callback.html"
  });
  esriId.registerOAuthInfos([oauthInfo]);

  signInButton.addEventListener("click", () => signIn());
  signOutButton.addEventListener("click", signOut);
  publishButton.addEventListener("click", publishWorkflow);
  fileInput.addEventListener("change", onFileSelected);

  esriId.checkSignInStatus(`${config.portalUrl}/sharing`)
    .then(() => signIn(false))
    .catch(() => setSignedOut());

  function assertConfigured() {
    const missing = [];
    if (!config.clientId || config.clientId.startsWith("REPLACE_")) missing.push("clientId");
    if (!config.webToolUrl || config.webToolUrl.startsWith("REPLACE_")) missing.push("webToolUrl");
    if (missing.length) {
      throw new Error(`Update config.js before deployment. Missing: ${missing.join(", ")}`);
    }
  }

  async function signIn(prompt = true) {
    try {
      credential = prompt
        ? await esriId.getCredential(`${config.portalUrl}/sharing`, { oAuthPopupConfirmation: false })
        : await esriId.findCredential(config.portalUrl);
      if (!credential) credential = await esriId.getCredential(`${config.portalUrl}/sharing`);

      portal = new Portal({ url: config.portalUrl, authMode: "immediate" });
      await portal.load();
      setSignedIn();
      setStatus(`Signed in as ${portal.user.fullName || portal.user.username}. Choose a TIFF.`, "success");
    } catch (error) {
      setSignedOut();
      setStatus(normalizeError(error), "error", error);
    }
  }

  function signOut() {
    esriId.destroyCredentials();
    portal = null;
    credential = null;
    fileInput.value = "";
    resultLinks.innerHTML = "";
    setSignedOut();
    setStatus("Signed out.", "info");
  }

  function setSignedIn() {
    userLabel.textContent = portal.user.fullName || portal.user.username;
    signInButton.hidden = true;
    signOutButton.hidden = false;
    enableForm(true);
  }

  function setSignedOut() {
    userLabel.textContent = "Not signed in";
    signInButton.hidden = false;
    signOutButton.hidden = true;
    enableForm(false);
  }

  function enableForm(enabled) {
    fileInput.disabled = !enabled || busy;
    sourceTitle.disabled = !enabled || busy;
    deleteSource.disabled = !enabled || busy;
    publishButton.disabled = !enabled || busy || fileInput.files.length !== 1;
  }

  function onFileSelected() {
    const file = fileInput.files[0];
    resultLinks.innerHTML = "";
    if (!file) return enableForm(Boolean(portal));
    const extension = file.name.toLowerCase();
    if (!extension.endsWith(".tif") && !extension.endsWith(".tiff")) {
      fileInput.value = "";
      setStatus("Choose a file ending in .tif or .tiff.", "error");
      return enableForm(true);
    }
    sourceTitle.value = file.name.replace(/\.tiff?$/i, "") || "Uploaded TIFF Source";
    setStatus(`Ready to upload ${file.name} (${formatBytes(file.size)}).`, "info");
    enableForm(true);
  }

  async function publishWorkflow() {
    const file = fileInput.files[0];
    if (!portal || !credential || !file) return;

    let sourceItemId = null;
    setBusy(true);
    resultLinks.innerHTML = "";

    try {
      setStatus("Uploading the local TIFF to ArcGIS Online content...", "info");
      const uploadResult = await uploadSourceItem(file);
      sourceItemId = uploadResult.id;
      addLink("Temporary TIFF source item", `${config.portalUrl}/home/item.html?id=${sourceItemId}`);

      setStatus("TIFF uploaded. Submitting the Notebook Web Tool...", "info");
      const submit = await submitWebTool(sourceItemId);
      if (!submit.jobId) throw new Error(`Web tool did not return a jobId: ${JSON.stringify(submit)}`);

      setStatus(`Web tool job submitted: ${submit.jobId}`, "info");
      const completedJob = await waitForJob(submit.jobId);
      const outputs = await readJobOutputs(submit.jobId, completedJob);

      if (deleteSource.checked) {
        setStatus("Publishing succeeded. Deleting the temporary TIFF source item...", "info");
        await deletePortalItem(sourceItemId);
        sourceItemId = null;
      }

      renderOutputs(outputs);
      setStatus(outputs.output_summary || "TIFF published successfully.", "success", outputs);
      fileInput.value = "";
    } catch (error) {
      setStatus(normalizeError(error), "error", error);
      if (sourceItemId) {
        addLink("Uploaded TIFF source item retained for troubleshooting", `${config.portalUrl}/home/item.html?id=${sourceItemId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadSourceItem(file) {
    const form = new FormData();
    form.append("f", "json");
    form.append("token", credential.token);
    form.append("title", sourceTitle.value.trim() || file.name);
    form.append("type", "File");
    form.append("tags", config.sourceTags);
    form.append("filename", file.name);
    form.append("file", file, file.name);

    const url = `${config.portalUrl}/sharing/rest/content/users/${encodeURIComponent(portal.user.username)}/addItem`;
    const response = await fetch(url, { method: "POST", body: form });
    const json = await response.json();
    console.log(json);
    if (!response.ok || json.error || !json.success || !json.id) {
      throw new Error(json.error?.message || `TIFF upload failed: ${JSON.stringify(json)}`);
    }
    return json;
  }

  async function submitWebTool(sourceItemId) {
    const inputValue = JSON.stringify({ itemId: sourceItemId });
    const query = {
      f: "json",
      token: credential.token
    };
    query[config.webToolFileParameter] = inputValue;

    const response = await postForm(`${stripSlash(config.webToolUrl)}/submitJob`, query);
    if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
    return response;
  }

  async function waitForJob(jobId) {
    const jobUrl = `${stripSlash(config.webToolUrl)}/jobs/${encodeURIComponent(jobId)}`;
    while (true) {
      const job = await getJson(jobUrl, { f: "json", token: credential.token });
      const status = job.jobStatus;
      const messages = (job.messages || []).map(m => m.description).filter(Boolean);
      setStatus(`Web tool status: ${status}${messages.length ? `\n${messages[messages.length - 1]}` : ""}`, "info");

      if (status === "esriJobSucceeded") return job;
      if (["esriJobFailed", "esriJobCancelled", "esriJobTimedOut"].includes(status)) {
        throw new Error(messages.join("\n") || `Web tool ended with status ${status}.`);
      }
      await sleep(config.pollIntervalMs);
    }
  }

  async function readJobOutputs(jobId, job) {
    const outputs = {};
    const results = job.results || {};
    for (const name of Object.keys(results)) {
      const resultUrl = `${stripSlash(config.webToolUrl)}/jobs/${encodeURIComponent(jobId)}/results/${encodeURIComponent(name)}`;
      const response = await getJson(resultUrl, { f: "json", token: credential.token });
      outputs[name] = response.value ?? response;
    }
    return outputs;
  }

  async function deletePortalItem(itemId) {
    const url = `${config.portalUrl}/sharing/rest/content/users/${encodeURIComponent(portal.user.username)}/items/${encodeURIComponent(itemId)}/delete`;
    const response = await postForm(url, { f: "json", token: credential.token });
    if (response.error || response.success !== true) {
      throw new Error(response.error?.message || `Unable to delete temporary item ${itemId}.`);
    }
  }

  async function postForm(url, values) {
    const body = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    return response.json();
  }

  async function getJson(url, values) {
    const query = new URLSearchParams(values);
    const response = await fetch(`${url}?${query}`);
    return response.json();
  }

  function renderOutputs(outputs) {
    const knownLinks = [
      ["Imagery item", outputs.output_item_url],
      ["Imagery service", outputs.output_layer_url]
    ];
    knownLinks.forEach(([label, url]) => { if (isHttpUrl(url)) addLink(label, url); });
  }

  function addLink(label, url) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    resultLinks.appendChild(a);
  }

  function setBusy(value) {
    busy = value;
    progress.hidden = !value;
    enableForm(Boolean(portal));
  }

  function setStatus(message, type = "info", details = null) {
    statusNode.textContent = message;
    statusNode.className = `status ${type}`;
    if (details) {
      detailsNode.textContent = safeStringify(details);
      detailsNode.hidden = false;
    } else {
      detailsNode.hidden = true;
    }
  }

  function normalizeError(error) {
    return error?.message || error?.details?.messages?.join("\n") || String(error);
  }

  function safeStringify(value) {
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }

  function stripSlash(value) { return value.replace(/\/$/, ""); }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function isHttpUrl(value) { return typeof value === "string" && /^https?:\/\//i.test(value); }
  function formatBytes(bytes) {
    if (!bytes) return "0 bytes";
    const units = ["bytes", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }
});
