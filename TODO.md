- ubuntu login for hermes for those images and sort out metadata user-script/user-data used
  for those
- upgrade restify

- achilles 2 minute hang ~6 machine deletes *if using node 0.10*!
- "OS" column in iris output (and in summaries in helen output). Perhaps put OS
  in the names?
    Nestor-20130919T080438Z-0
    -> Nestor-linux-<7char-sha-generation>-0
    -> Teucer-smartos-4ab45de-0
- If date removed from names, then want CREATED column in iris output.
- Default profile should be the "SDC_*" envvars.
- node-smartdc: CloudAPI should take a logger (with default to curr behaviour)
  Then could passing src:true.
- name selection: preload those for N before to avoid dupes
- trojan: custom trojan script/command
- setting up easily for staging: perhaps 'smrt paris -H stage' where 'stage'
  there is a headnode ssh login (in my ~?.ssh/config)
- iris listing of images: show the originNameVer
- whois [name]
    - random name
    - gives desc on that character
- achilles: wait for deleting and print each machine on deletion completion
- finish paris (creating profiles nicely)
- generalize to a "manage this multi-image/machine project" tool
