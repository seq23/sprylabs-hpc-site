# Daily Auto Publish

## Morning run
- Fetch Reddit inputs.
- Normalize and cluster.
- Score clusters.
- Prepare queue.
- Refresh indexes.
- Run validators.
- Commit only if all gates pass.

## Evening run
- Re-fetch incrementals.
- Update cluster archive.
- Refresh queue for the next cycle.
- Optional light publish pass.

## Logs
- `data/reddit/raw/`
- `data/reddit/normalized/`
- `data/reddit/clusters/`
- `data/reddit/archive/`

## Failure handling
If any stage fails:
- stop publish
- keep logs
- do not touch existing generated pages
- rerun manually via workflow_dispatch after fix
