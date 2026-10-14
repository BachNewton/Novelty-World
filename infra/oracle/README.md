# The Oracle Cloud server

Novelty World owns one always-on Linux machine: an Oracle Cloud "Always Free" virtual machine. It is the home for anything the site needs that Vercel can't run. Vercel only runs short-lived functions, so a long-lived server, such as a WebSocket relay that both players stay connected to, lives here.

Claude manages the machine entirely from the command line, over SSH and the OCI CLI. Nothing in the workflow needs Oracle's web console.

## The machine

- **Shape:** `VM.Standard.E2.1.Micro`, Always Free. x86_64, one OCPU (two vCPUs as Linux sees it), 1 GB of memory with no swap, and a 45 GB disk.
- **System:** Ubuntu 24.04 LTS, with unattended upgrades on.
- **Region:** `eu-stockholm-1`, about 10 ms round trip from the owner in Finland.
- **Names in Oracle:** everything is named after Novelty World: the instance `novelty-world` (also its Linux hostname), the network `novelty-world-vcn`, its subnet, gateway and defaults to match. The internal DNS labels are still `happyplace` (the network) and `hpsub` (the subnet), from the machine's first life as a game server: Oracle can't change a DNS label after creation, recreating the network means terminating the machine, and nothing here uses them.
- **Installed:** Go (in `/usr/local/go`), git, and `iptables-persistent`. Node, Tailscale and any web server are not installed.
- **Runs:** nothing of Novelty World's yet; only Ubuntu's and Oracle's own agents.

Memory is the tight resource: about 570 MB is free with nothing of ours running. Anything new must be small, and must be measured once it is running.

## Access

- **SSH:** `ssh novelty-oracle`. The alias lives in the owner's dotfiles (`~/.ssh/config`, kept with chezmoi): user `ubuntu`, key `~/.ssh/oci_happy_place`. The alias is the reference, so the machine's address stays out of this public repo. `ubuntu` has passwordless sudo, so commands run non-interactively, e.g. `ssh novelty-oracle 'sudo systemctl status <unit>'`. A new computer needs the key file copied over by hand; it is never committed anywhere.
- **The cloud side:** the OCI CLI (`oci`), configured in `~/.oci/config` with an API key. It reaches what SSH can't: the instance's state, a reboot, and the cloud firewall. It warns about the API key's label on every call; `SUPPRESS_LABEL_WARNING=True` silences it.

## Two firewalls

A port is reachable from the internet only if both firewalls let it through:

1. **The cloud firewall:** the security list `Default Security List for novelty-world-vcn`, changed with `oci network security-list update`. That command replaces the whole rule list, so read the current rules first and send them back with the new one added.
2. **The machine's iptables:** Oracle's Ubuntu image ends the `INPUT` chain with a reject-everything-else rule, so a new allow rule must be inserted before it. Save the rules with `sudo netfilter-persistent save` (to `/etc/iptables/rules.v4`), or they are lost on reboot.

Open now: 22 (SSH) only.

## Rules

- **Record every change here, in the same change:** a package installed, a unit added, a port opened. If the machine is lost, it is rebuilt from this page.
- **Restart the unit that is misbehaving, not the machine.** A reboot drops every connected player of every service on it.
- **Each service gets its own systemd unit,** with `Restart=always`, so it comes back after a crash or a reboot.
