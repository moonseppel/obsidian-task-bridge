# Specific Rules for Obsidian Projects

Summarizes the rules that are specifically relevant for development of a plugin for the Obsidian note taking app.

## General
1. Never use `process.env`. It won't work on mobile.

## Logging
1. A log is for diagnosis and a `Notice` is for the user. When a failure needs user action, it gets both. A silent transient failure gets a log only.
