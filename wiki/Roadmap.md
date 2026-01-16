# 🗺️ Roadmap

## Planned Features

- [ ] Svelte 5 migration (resolves npm vulnerabilities)
- [ ] WebSocket support for real-time updates
- [ ] Multi-account support
- [ ] Advanced charts and analytics
- [ ] Export device list to CSV
- [ ] Custom themes

## Known Issues

### npm vulnerabilities

There are currently 12 npm audit vulnerabilities (3 low, 9 moderate) in the frontend dependencies. These are inherited from Svelte 4 and will be resolved with the Svelte 5 migration.

### Untested UI operations

Not all write operation buttons have been fully tested against the live Eero API. The following actions may have issues:

- Run Speed Test
- Block/Unblock device
- Rename device (set nickname)
- Reboot eero
- Pause/Unpause profile

## Contributing

Want to help? Check out:

- [Open Issues](https://github.com/fulviofreitas/eero-ui/issues)
- [Pull Requests](https://github.com/fulviofreitas/eero-ui/pulls)
