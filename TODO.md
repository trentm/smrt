- test helen and trojan on beta4, ams1, east1, ...
- better help for helen showing that N vms comes from args too
- node-smartdc: CloudAPI should take a logger (with default to curr behaviour)
  Then could passing src:true.
- 'smrt -p <profile>' to not have to set default. Also SMRT_PROFILE=<profile>.
- name selection: preload those for N before to avoid dupes
- trojan: custom trojan script/command
- achilles --dry-run|-n
- achilles progress
- achilles is DOG SLOOOW. Why? There is a hang bug there.
- setting up easily for staging: perhaps 'smrt paris -H stage' where 'stage'
  there is a headnode ssh login (in my ~?.ssh/config)
- iris listing of images: show the originNameVer
- iris -a|--all
- whois [name]
    - random name
    - gives desc on that character
- helen:
    smrt helen [-n <num>] [<image-name>[:<package-name>]]
- hermes <command>: like sdc-oneachnode for each
- achilles: wait for deleting and print each machine on deletion completion
- finish paris (creating profiles nicely)
