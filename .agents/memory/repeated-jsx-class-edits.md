---
name: Repeated JSX class edits
description: A safe editing habit for repeated utility-class strings in this app's large JSX file.
---

When editing repeated Tailwind class strings in a large JSX file, anchor the patch with nearby unique visible copy rather than matching the class string alone.

**Why:** Identical section-header classes occur in multiple parts of the interface, so a broad match can silently change the wrong section while still typechecking.

**How to apply:** Include the closest unique heading or label in the patch context, then verify the intended text/class pair with a targeted search and a preview.