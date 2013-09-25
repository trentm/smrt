Homeric SmartDataCenter (SDC).

SmartDataCenter is Joyent's cloud thing. It [has a Cloud
API](http://apidocs.joyent.com/cloudapi/). There are a number of SDC clouds out
there. [Joyent has one](https://my.joyentcloud.com). Let's do some stuff with
an SDC cloudapi while reliving the Iliad.

Status: Currently the descriptions in this README are more the design docs
than the current status. The best current status is via the online help
from the 'smrt' command: `smrt help <command>`.


# smrt paris (partially implemented)

Manage smrt 'profiles', the config to talk to a given SDC cloudapi
with a particular account. If you are looking to setup your *COAL*,
then look to `smrt aphrodite`.

Paris got the Trojan War started. So he'll set it up for you:

    smrt paris [<profile>]    # WARNING: not yet implemented

This will interactively walk through creating a 'smrt profile'.

    $ smrt paris -l
    ... list current smrt profiles (i.e. combo of settings for a cloudapi usage)

    $ smrt paris west
    ... sets current profile to the 'west' profile, else errors out
        "smrt: error: no 'west' smrt profile (use '-l' to list profiles, '-c' to create)"

    $ smrt paris
    ... show current profile, if have one:
        # Current smrt profile: 'west'
        SDC_URL=https://eu-ams-1.api.joyentcloud.com
        SDC_ACCOUNT=Joyent_Dev
        SDC_KEY_ID=b3:f0:a1:6c:18:3b:47:63:ae:6e:57:22:74:71:d4:bc
    ... else says: "no current smrt profile, create one now? [Y/n]"
        smrt profile name (pick a short pnemonic): ____

        SDC cloud api URL (aka SDC_URL):
            1. https://us-west-1.api.joyentcloud.com
            2. https://eu-ams-1.api.joyentcloud.com
            3. https://us-sw-1.api.joyentcloud.com
            4. https://us-east-1.api.joyentcloud.com
        Pick a known one by entering the number, or enter a URL: ____

        login (aka SDC_ACCOUNT): ____

        key fingerprint (aka SDC_KEY_ID).
            1. ~/.ssh/id_rsa.pub
            2. ~/.ssh/sdc.id_rsa.pub
            ...
        Select one of the RSA SSH keys in your "~/.ssh" dir by
        entering the number or paste in a fingerprint (e.g.
        from `ssh-add -l`): ____


# smrt aphrodite

Setup COAL to be able to use cloudapi in it, then update/add your "coal"
profile.

    $ smrt aphrodite
    $ smrt paris coal    # make COAL your default profile

Aphrodite was also responsible for setting up the Trojan war: by making Paris
and Helen fall in love.


# smrt iris

List all current Homeric images and instances.

    smrt iris [-a|--all]

Examples:

    $ smrt iris
    ... list all machines and images for the current profile.

    $ smrt iris -a
    ... for all profiles


# smrt helen

Launch a thousand ships... or at least few machine instances (aka VMs).

    smrt helen [-n <num>]

Examples:

    $ smrt helen
    ... chooses a Greek name from the Iliad for the instance.
        (http://en.wikipedia.org/wiki/List_of_Homeric_characters)
    ... chooses an image at random (only selecting the latest in a name group)
    ... chooses a package at random (might have rules for min ram per image OS)
    ... provisions the instance
    ... repeat N-1 times (default N is 3)
    ... wait for all provisions


# smrt achilles

Achilles' rage. Delete all Homeric instances *and images* (for the current
smrt profile). Homeric instances and images are those tagged with `{"homeric":
true}`, use `smrt iris` to list them all.

    smrt achilles [-I|--skip-images] [<name-pattern>]


# smrt trojan

Make a custom image. The "trojan" is the script run to add customizations
to the origin image.

    smrt trojan <origin-image-name> [<trojan-script-or-cmd>]

Examples:

    $ smrt trojan centos
    ... finds latest image named '*centos*'
    ... chooses a Trojan name from the Iliad
    ... creates an instance
