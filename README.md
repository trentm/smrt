Homeric SmartDataCenter (SDC).

SmartDataCenter is Joyent's cloud thing. It [has a Cloud
API](http://apidocs.joyent.com/cloudapi/). There are a number of SDC clouds out
there. [Joyent has one](https://my.joyentcloud.com). Let's do some stuff with
an SDC cloudapi while reliving the Iliad.

# smrt paris

**Status: partially implemented.**

Paris gets it all started. So he'll set it up for you:

    smrt paris [<profile>]

This will interactively walk through setting up for talking to a given SDC
cloudapi as a particular user (each such config is called a 'smrt profile').

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



# smrt helen (NYI)

Launch a thousand ships... or a few (less than a 1000) instances (aka VMs).

    smrt helen [-n <num-insts>] [<image-name>[:<package-name>]]

Examples:

    $ smrt helen
    ... chooses a Greek name from the Iliad for the instance.
        (http://en.wikipedia.org/wiki/List_of_Homeric_characters)
    ... chooses an image at random (only selecting the latest in a name group)
    ... chooses a package at random (might have rules for min ram per image OS)
    ... provisions the instance
    ... repeat N-1 times (default N is 3)
    ... wait for all provisions


# smrt trojan (NYI)

Make a custom image. The "trojan" is the script run to add customizations
to the origin image.

    smrt trojan <origin-image-name> [<trojan-script-or-cmd>]

Examples:

    $ smrt trojan centos
    ... finds latest image named '*centos*'
    ... chooses a Trojan name from the Iliad
    ... creates an instance
    XXX


# smrt achilles (NYI)

Rage. Delete all Homeric instances *and images*. Homeric instances and images
are those tagged with `{"homeric": true}`.

    smrt achilles [-I|--skip-images] [<name-pattern>]


# smrt hermes (NYI, better name?)

List all current Homeric images and instances.
