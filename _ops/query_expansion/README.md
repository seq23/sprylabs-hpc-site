# Query Expansion / Velocity Loop

This folder documents the Spry/BHPC velocity layer installed on top of the existing site.

Core rule: pages should be generated from scored backlog items, not from random one-off prompts.

Lifecycle:
raw signals → normalized stream → clusters → prebuild validation → answer-surface scoring → backlog → fanout/authority → validation.
