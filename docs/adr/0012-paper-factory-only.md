# Keep only the paper factory

The project and installable library support the configured paper factory
through `RoomFactory`. The owner chose to remove the earlier pixel-character
factory instead of maintaining it or shipping an optional compatibility
bundle. One room contract and appearance keep the product, demo and asset
inventory aligned with that scope.

This deliberately breaks the old `Factory`/`Pipeline` integration. Hosts
must construct room state and use `petAssets` for custom agent art;
`FactoryHandle` remains the view-control interface. Legacy appearance flags,
wardrobes, per-agent sprite fields, pixel-character sheets and the seeded
legacy demo are retired. Configured transitions, human attention, shared
assignments, themes, billboards and custom pet artwork remain supported.

The bundled core GLB remains because the paper view uses its geometry.
Paper status badges are procedural; the old icon PNGs and their generator
are removed with the pixel-character sheets. Historical screenshots, measurements and earlier ADRs remain records
of their milestones, not supported product modes. ADR 0010's room contract
and ADR 0011's configured conveyors are the active layout and routing
contracts; this retires the remaining legacy provisions of ADRs 0002,
0003, 0006, 0007, 0008 and 0009.
