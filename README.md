# Publish TIFF to ArcGIS Online

A static GitHub Pages or Amazon S3 application that provides a local file browser, uploads one TIFF/GeoTIFF to ArcGIS Online, and invokes a published ArcGIS Notebook Web Tool. The notebook creates the persistent hosted imagery layer on its first successful run and overwrites that same imagery item on later runs.

## Architecture

1. User signs in with ArcGIS OAuth.
2. User chooses a local `.tif` or `.tiff` file.
3. The browser uploads the file as a temporary `GeoTIFF` item in the signed-in user's ArcGIS Online content.
4. The app submits the Notebook Web Tool with `input_tif_file = {"itemId":"..."}`.
5. The notebook publishes or overwrites the hosted imagery layer.
6. After success, the app optionally deletes the temporary source item.

No client secret is stored in this app. Do not add a client secret to static files.

## Required configuration

Open `config.js` and set:

- `clientId`: Client ID from an ArcGIS Online Application item.
- `webToolUrl`: Full REST task URL for the published Notebook Web Tool, ending in `/GPServer/<TaskName>`.

The Notebook Web Tool input must be named `input_tif_file`. The code expects output names `output_item_url`, `output_layer_url`, and `output_summary` when available.

## Register the OAuth application

1. In ArcGIS Online, create an Application item for a browser application.
2. Add the exact deployed app URL as an allowed redirect URI.
3. For GitHub Pages, include the repository path and trailing slash, for example:
   `https://YOUR_ACCOUNT.github.io/YOUR_REPOSITORY/`
4. Copy the Application item's client ID into `config.js`.

## GitHub Pages deployment

1. Create a GitHub repository.
2. Copy the five app files into the repository root.
3. Commit and push.
4. In repository Settings, open Pages.
5. Deploy from the main branch and root folder.
6. Add the final Pages URL to the ArcGIS OAuth application's redirect URIs.

## Amazon S3 deployment

1. Create an S3 bucket and enable static website hosting, or place CloudFront in front of a private bucket.
2. Upload the app files while preserving their names.
3. Configure `index.html` as the index document.
4. Use HTTPS for the public application endpoint.
5. Add the exact HTTPS application URL to the ArcGIS OAuth application's redirect URIs.

## ArcGIS privileges

The signed-in user needs permission to create content, run the secured Notebook Web Tool, and perform the imagery publishing operation used by the notebook.

## Security notes

- The browser uses OAuth authorization code flow with PKCE through the ArcGIS Maps SDK for JavaScript.
- Do not put an ArcGIS password, token, API key with elevated privileges, or client secret in `config.js`.
- The app uploads to the signed-in user's own content.
- The temporary source item is deleted only after the web tool reports success and only when the checkbox is selected.

## Troubleshooting

- **OAuth redirect error:** Add the exact deployed URL to the Application item's redirect URIs.
- **Upload fails:** Verify the user can create content and that the TIFF size is accepted by the organization.
- **Web tool submit fails:** Confirm `webToolUrl` is the task URL, not only the web tool item page or the parent GPServer URL.
- **Notebook says no TIFF supplied:** Confirm `webToolFileParameter` is exactly `input_tif_file`, and that the notebook's file resolver supports `itemId`.
- **CORS error:** Confirm the app is served over HTTPS and the ArcGIS REST and web-tool endpoints allow the browser origin.
- **Duplicate imagery output:** Keep the notebook's persistent output title fixed and remove duplicate exact-title imagery items before rerunning.
