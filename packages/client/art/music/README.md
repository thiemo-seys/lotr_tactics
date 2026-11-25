# Music

The play page's two music tracks (`docs/game-spec.md` section 12, Sound) are generated with an AI music tool and kept in `packages/client/public/music/`. The page plays a track only if its file is there, so the game runs silent without them.

| File | When it plays |
|---|---|
| `calm.mp3` | The menu, the lobby, Councils, planning and the end of a game |
| `battle.mp3` | Fights and their results |

The page crossfades between them over 1.5 seconds and loops each, so each track should loop without a seam.

## What a track needs

- MP3, stereo, 128 to 192 kbps, at most 3 MB.
- 60 to 120 seconds long, ending where it can start again: the same chord, tempo and loudness at both ends. Trim the tool's fade-in and fade-out, if it adds them.
- Steady loudness, around −16 LUFS, with no big swells. It plays under the interface's sounds, and the stings lower it while they play.
- Instrumental, with no voices.
- Original: Middle-earth in spirit, but nothing from the films' scores or anyone else's music, and no names from them in the prompt.
- A licence that allows using it in a game that may be released. Check the tool's terms for the plan you generate on, and note the tool, plan and date below.

## Prompts

**calm**

> Original instrumental fantasy loop, 90 seconds, 72 BPM, D Dorian. Celtic harp and a wooden flute carry a gentle, unhurried melody over a soft string pad and a low cello drone, with a light frame drum every other bar. Pastoral, warm and a little wistful, calm enough to think over. No vocals. Even dynamics throughout, no intro or outro, ending on the chord it starts on so it loops seamlessly.

**battle**

> Original instrumental fantasy battle loop, 90 seconds, 116 BPM, D minor. Taiko and frame drums drive a steady ostinato under staccato low strings, with short horn calls and a gritty hurdy-gurdy drone. Tense and determined rather than overwhelming, leaving room for sound effects on top. No vocals, no choir. Even dynamics throughout, no intro or outro, ending where it starts so it loops seamlessly.

## Tracks in use

| File | Tool and plan | Date | Notes |
|---|---|---|---|
| `calm.mp3` | | | Not generated yet |
| `battle.mp3` | | | Not generated yet |
