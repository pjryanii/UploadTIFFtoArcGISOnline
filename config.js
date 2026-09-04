// Replace the two required values before deployment.
window.APP_CONFIG = {
  // Client ID from an ArcGIS Online Application item.
  clientId: "4eV5Tpu3LAc9n0Z7",

  // Full REST URL of the published Notebook Web Tool task.
  // It normally ends with /GPServer/<TaskName>.
  webToolUrl: "https://notebookswebtools6.arcgis.com/arcgis/rest/services/ea0a88ca300e45ab9e6b8e04e622108c/GPServer",

  portalUrl: "https://lo-doun.maps.arcgis.com/",

  // Must match the Notebook Web Tool input variable name.
  webToolFileParameter: "input_tif_file",

  // Polling interval for asynchronous jobs.
  pollIntervalMs: 2000,

  // Tags applied to the temporary uploaded GeoTIFF item.
  sourceTags: "TIFF,GeoTIFF,temporary upload,web application"
};
