---
description: Auto push changes to GitHub (triggers Vercel deploy)
---
// turbo-all

After making any code changes, always run the following:

1. Stage all changes, commit with a descriptive message, and push to origin:
```bash
git add . && git commit -m "<descriptive commit message>" && git push
```

This will automatically trigger the Vercel deployment pipeline.
