# The Oracle Cloud server

Novelty World owns one always-on Linux machine: an Oracle Cloud "Always Free" virtual machine. It is the home for anything the site needs that Vercel can't run. Vercel only runs short-lived functions, so a long-lived server, such as a WebSocket relay that both players stay connected to, lives here.

Claude manages the machine entirely from the command line, over SSH and the OCI CLI. Nothing in the workflow needs Oracle's web console.

## The machine

- **Shape:** `VM.Standard.E2.1.Micro`, Always Free. x86_64, one OCPU (two vCPUs as Linux sees it), 1 GB of memory with no swap, and a 45 GB disk.
- **System:** Ubuntu 24.04 LTS, with unattended upgrades on.
- **Region:** `eu-stockholm-1`, about 10 ms round trip from the owner in Finland.
- **Names in Oracle:** the instance is `happy-place-server` and its network is `happy-place-vcn`, after its first tenant (see Tenants).
- **Installed:** Go (in `/usr/local/go`), git, and `iptables-persistent`. Node, Tailscale and any web server are not installed.

Memory is the tight resource. The machine has a few hundred MB to spare, so anything new must be small, and must be measured once it is running.

## Access

- **SSH:** `ssh novelty-oracle`. The alias lives in the owner's dotfiles (`~/.ssh/config`, kept with chezmoi): user `ubuntu`, key `~/.ssh/oci_happy_place`. The alias is the reference, so the machine's address stays out of this public repo. `ubuntu` has passwordless sudo, so commands run non-interactively, e.g. `ssh novelty-oracle 'sudo systemctl status <unit>'`. A new computer needs the key file copied over by hand; it is never committed anywhere.
- **The cloud side:** the OCI CLI (`oci`), configured in `~/.oci/config` with an API key. It reaches what SSH can't: the instance's state, a reboot, and the cloud firewall. It warns about the API key's label on every call; `SUPPRESS_LABEL_WARNING=True` silences it.

## Two firewalls

A port is reachable from the internet only if both firewalls let it through:

1. **The cloud firewall:** the security list `Default Security List for happy-place-vcn`, changed with `oci network security-list update`. That command replaces the whole rule list, so read the current rules first and send them back with the new one added.
2. **The machine's iptables:** Oracle's Ubuntu image ends the `INPUT` chain with a reject-everything-else rule, so a new allow rule must be inserted before it. Save the rules with `sudo netfilter-persistent save` (to `/etc/iptables/rules.v4`), or they are lost on reboot.

Open now: 22 (SSH), 2222 and 2223 (Happy Place).

## Tenants

| Service | Port | systemd unit | Checkout on the machine | Deploys from |
|---|---|---|---|---|
| Happy Place 2 | 2222 | `happy-place` | `~/Happy-Place-2` | `main` of `BachNewton/Happy-Place-2` |
| Happy Place 2 (dev) | 2223 | `happy-place-dev` | `~/Happy-Place-2-dev` | `dev` of `BachNewton/Happy-Place-2` |

Happy Place is a separate repo: a multiplayer game players reach over SSH. Its own GitHub Actions deploy it: on a push, they SSH in, pull, build with Go and restart its unit. Its players stay connected while they play, so restarting its units or rebooting the machine drops them.

## Rules

- **Record every change here, in the same change:** a package installed, a unit added, a port opened. If the machine is lost, it is rebuilt from this page.
- **Never reboot the machine, or restart another tenant's unit, to fix something of ours.** Restart only the unit that is misbehaving.
- **Each service gets its own systemd unit,** with `Restart=always`, so it comes back after a crash or a reboot.
