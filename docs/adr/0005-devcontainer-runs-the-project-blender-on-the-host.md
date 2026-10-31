# Project commands run in the devcontainer; Blender and generation stay on the host

Everything project-side runs inside the devcontainer: install, dev server,
build, tests, sprite tooling, screenshots and git. That keeps the environment
reproducible and documented in one place.

Two things deliberately stay outside. 3D generation goes through Comfy Cloud,
which is a remote service driven from the host. Blender runs on the host in
background mode through scripts committed under `tools/blender`, writing
finished GLB files into the repo, because the container cannot run the host's
Blender and a Linux Blender inside it would be a second, older toolchain to
keep in step. Every committed asset still comes from a script so it can be
rebuilt.
