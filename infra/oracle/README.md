# The Oracle Cloud server

Novelty World owns one always-on Linux machine: an Oracle Cloud "Always Free" virtual machine. It is the home for anything the site needs that Vercel can't run. Vercel only runs short-lived functions, so a long-lived server, such as a WebSocket relay that both players stay connected to, lives here.

Claude manages the machine entirely from the command line, over SSH and the OCI CLI. Nothing in the workflow needs Oracle's web console.

## The machine

- **Shape:** `VM.Standard.E2.1.Micro`, Always Free. x86_64, one OCPU (two vCPUs as Linux sees it), 1 GB of memory with no swap, and a 45 GB disk.
- **System:** Ubuntu 24.04 LTS, with unattended upgrades on.
- **Region:** `eu-stockholm-1`, about 10 ms round trip from the owner in Finland.
- **Names in Oracle:** everything is named after Novelty World: the instance `novelty-world` (also its Linux hostname), the network `novelty-world-vcn`, its subnet, gateway and defaults to match. The internal DNS labels are still `happyplace` (the network) and `hpsub` (the subnet), from the machine's first life as a game server: Oracle can't change a DNS label after creation, recreating the network means terminating the machine, and nothing here uses them.
- **Installed:**
  - Node 24 LTS, from nodejs.org's Linux tarball (checked against its published SHA-256) into `/usr/local/node`, linked as `/usr/local/bin/node`. Updating it means installing a newer tarball the same way.
  - Caddy, the web server in front of the relay (see The relay), from Caddy's own apt repository, so unattended upgrades keep it current.
  - Go (in `/usr/local/go`), git and `iptables-persistent`. No web server.
- **Runs:** the relay (see The relay), besides Ubuntu's and Oracle's own agents.

Memory is the tight resource: about 570 MB was free before the relay, which uses about 30 MB. Anything new must be small, and must be measured once it is running.

## Access

- **SSH:** `ssh novelty-oracle`. The alias lives in the owner's dotfiles (`~/.ssh/config`, kept with chezmoi): user `ubuntu`, key `~/.ssh/oci_happy_place`. The alias is the reference, so the machine's address stays out of this public repo. `ubuntu` has passwordless sudo, so commands run non-interactively, e.g. `ssh novelty-oracle 'sudo systemctl status <unit>'`. A new computer needs the key file copied over by hand; it is never committed anywhere.
- **The cloud side:** the OCI CLI (`oci`), configured in `~/.oci/config` with an API key. It reaches what SSH can't: the instance's state, a reboot, and the cloud firewall. It warns about the API key's label on every call; `SUPPRESS_LABEL_WARNING=True` silences it.

## The relay

Novelty World's multiplayer server (`relay/` in this repo; see Multiplayer in the root `CLAUDE.md`).

- **The service:** systemd unit `novelty-relay`, whose source is `infra/oracle/novelty-relay.service`. It runs `/opt/novelty-relay/relay.cjs`, a single-file bundle of the relay, as the locked-down system user `relay`, listening on `127.0.0.1:8080` only. It is `Type=notify`, so `systemctl restart` returns once the relay is listening.
- **Deploying:** `npm run relay:deploy` bundles the relay, copies it and the unit over, and restarts the service. It is run by hand from a checkout: a push does not deploy it. Deploy the relay before pushing browser code that needs a relay change, and keep the protocol (`src/shared/lib/peer/protocol.ts`) backward compatible for the moments between.
- **Reaching it:** browsers connect to `wss://novelty-world.mooo.com`, the relay's address in the browser (`RELAY_URL` in `src/shared/lib/peer/room.ts`). The name is an `A` record pointing at the machine's public IP, in the owner's FreeDNS account (freedns.afraid.org), on its shared domain `mooo.com`; the site credits FreeDNS on its credits page, as FreeDNS asks. Caddy answers on ports 80 and 443 with a certificate it gets and renews itself, and passes the secure WebSocket through to the relay on localhost. Its config's source is `infra/oracle/Caddyfile`, installed as `/etc/caddy/Caddyfile`. FreeDNS's shared domains share one Let's Encrypt allowance among all their users; Caddy falls back to ZeroSSL on its own if Let's Encrypt refuses.
- **Logs:** `ssh novelty-oracle 'journalctl -u novelty-relay -f'`. The relay logs every connection it refuses.

## Two firewalls

A port is reachable from the internet only if both firewalls let it through:

1. **The cloud firewall:** the security list `Default Security List for novelty-world-vcn`, changed with `oci network security-list update`. That command replaces the whole rule list, so read the current rules first and send them back with the new one added.
2. **The machine's iptables:** Oracle's Ubuntu image ends the `INPUT` chain with a reject-everything-else rule, so a new allow rule must be inserted before it. Save the rules with `sudo netfilter-persistent save` (to `/etc/iptables/rules.v4`), or they are lost on reboot.

Open now: 22 (SSH), and 80 and 443 (Caddy).

## Rules

- **Record every change here, in the same change:** a package installed, a unit added, a port opened. If the machine is lost, it is rebuilt from this page.
- **Restart the unit that is misbehaving, not the machine.** A reboot drops every connected player of every service on it.
- **Each service gets its own systemd unit,** with `Restart=always`, so it comes back after a crash or a reboot.
