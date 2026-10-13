# Workflow and ModelArk continuation

## Build
- Add a ModelArk Seedream API route for text-to-image and reference-guided image editing, with server-only API key access and private storage for uploaded inputs and generated images.
- Add catalog entries and execution branches for Seedream workflows; clearly distinguish them from GPU-hosted ComfyUI templates.
- Add native ComfyUI workflow templates for Flux text-to-image, SDXL inpainting, and Wan 2.2 video, with matching prompt graphs and dependency notes.
- Add fixed downloadable API-format JSON templates for the three Perform Anywhere workflows, and expose those downloads in the workflow interface.
- Update architecture notes and roadmap; validate types/build and verify downloads and the visible workflow list.

## Technical details
- Keep ModelArk calls server-side and outputs in a private Storage bucket; retain signed media access through the existing media endpoint.
- The ModelArk credential is not currently configured. Implement the integration without requesting or embedding credentials; request the key only after the user confirms in a separate message.
- ModelArk APIs execute supported Seedream/Seedance tasks, not arbitrary ComfyUI graphs. Flux, SDXL, and Wan additions remain GPU workflows.
