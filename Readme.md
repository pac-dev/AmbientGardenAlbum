# A Walk through the Ambient Garden

This is an open-source music album based on [ambient.garden](https://github.com/pac-dev/AmbientGarden), an explorable musical landscape. This album contains the same musical elements as the landscape, but instead of being interactive, it's written as a deterministic composition. Everything is generated from code without using any pre-existing audio samples.

Musically, I tried to escape sounds commonly associated with generative music. The album is based on microtonal harmony and just-intonation, played by organic-sounding, physically modeled instruments which are heavily layered. The result is a deep style of ambient, with ethereal and classical influences.

## Listen to a pre-built version of the album

You can hear the album on [Spotify](https://open.spotify.com/album/6RPvBkBjCymWOk7BeONDv4) and [Apple Music](https://music.apple.com/us/album/a-walk-through-the-ambient-garden/1732863542). This repository only contains the source code to re-create the album, the nerd way.

## Build the album

The build script has 2 requirements:

- Deno, to run JS code. You can download it as a [single binary](https://github.com/denoland/deno/releases) or [install it properly](https://docs.deno.com/runtime/manual) if you prefer.
- [FFmpeg.](https://ffmpeg.org/download.html), for audio encoding.

To build the album, download or clone this repository, then run the following command in a terminal:

	deno run -A render.js album

By default, this will create the album as mp3 files in the `Generated/final/` directory. Note that this project does not really focus on efficiency (wouldn't be using Javascript otherwise!), the generation process needs about 1.5GB of RAM and takes 10+ minutes on a typical laptop. To customize album rendering, see the reference section below. 

## Composition and development environment

The music generation code was mostly written using the [Teasynth](https://github.com/pac-dev/Teasynth) web editor, which has features to play and debug music code, inline help for Faust library functions, etc. The MusicSource folder can be opened as a Teasynth project.

If you want to understand how any specific sound is made, start with the "macro" files in `MusicSource/tracks/`. These contain timestamped commands to start, stop and control "patches" within a track. The source for all these patches can be found in `MusicSource/patches/`. Javascript is used for high level composition code, while [Faust](https://faust.grame.fr/) is used for lower level audio-rate code. I recommend some familiarity with Faust before getting into `.dsp` files.

## Command reference

```
SUBCOMMAND: ALBUM
-----------------
Render the entire album, including cover art, to Generated/final/
Usage: deno run -A render.js album [--format=fmt] [--partial] [--ffargs ...]
Arguments:
    --format=fmt    final audio format (wav, mp3, flac...)
    --partial       keep existing rendered tracks
    --ffargs ...    all arguments after this will be passed to ffmpeg
Example 1: deno run -A render.js album
    Uses default settings, rendering the album as 290k mp3.
Example 2: deno run -A render.js album --format=mp3 --ffargs -b:a 200k
    Renders the album at a bitrate of 200k.

SUBCOMMAND: TRACK
-----------------
Render a single track to a wav file. Track names are in MusicSource/tracks/
Usage:    deno run -A render.js track <trackname> <outfile.wav>
Example:  deno run -A render.js track "06. occultation" test.wav
    Renders the 6th track to test.wav

SUBCOMMAND: MASTER-TRACK
------------------------
Master a single audio file, applying dynamics compression.
Usage: deno run -A render.js master-track <infile.wav> <outfile.wav>

SUBCOMMAND: OVERLAP-ALBUM
-------------------------
Add overlap between separately rendered audio tracks.
Usage:    deno run -A render.js overlap <indir> <stagedir> <outdir>
Example:  deno run -A render.js overlap stage2/ stage3/ stage4/

SUBCOMMAND: ENCODE
------------------
Encode and add metadata to rendered tracks.
Usage:    deno run -A render.js encode <indir> <outdir> [--format=fmt] [--ffargs ...]
Arguments:
    --format=fmt    final audio format (wav, mp3, flac...)
    --ffargs ...    all arguments after this will be passed to ffmpeg
Example:  deno run -A render.js encode stage4/ final/ --ffargs -b:a 200k
    Encodes the album at a bitrate of 200k.

SUBCOMMAND: COVER
-----------------
Generate the cover art to a png file.
Usage: deno run -A render.js cover <outfile> [--scale=N]
Example:  deno run -A render.js cover test.png --scale=2
    Generates the cover to test.png at 2x size.
```
