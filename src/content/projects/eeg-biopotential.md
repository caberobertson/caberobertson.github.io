---
title: EEG Biopotential Signal Analysis
outcome: Recorded and analyzed my own EEG with a NeuroPawn kit, working hands-on with electrode placement, artifacts, and raw biopotential data.
status: complete
period: "2026"
order: 6
audiences: [neurotech]
context: NeuroPawn biopotential kit, demonstrated at the El Paso Science Festival
tags: [EEG, Biopotential, Electrode Placement, Artifact Rejection, Signal Processing]
metrics:
  - { value: "Raw", label: "biopotential data, not a processed feed" }
  - { value: "µV", label: "signal scale, where artifacts dominate" }
artifacts: []
figure: image
figureData:
  caption: "Demonstrating the brain-computer interface kit to attendees at the El Paso Science Festival 2026."
  src: "/photo4.jpg"
  alt: "Demonstrating a brain-computer interface kit to attendees at the El Paso Science Festival"
  width: 1800
  height: 1350
---

## Problem and context

Biopotential signals are the hardest sensing problem I have worked on for a
simple reason: the signal of interest is microvolts, and nearly everything else
in the room is larger. Working with a NeuroPawn kit, I recorded and analyzed my
own EEG rather than reading about it.

## Constraints

Electrode placement determines what is recorded before any processing happens,
and the dominant features in a raw trace are usually not neural: eye blinks,
jaw clench, and cable movement all produce excursions far larger than the
rhythms underneath.

## Design and tradeoffs

The work was deliberately kept at the raw-data level. Using a processed or
pre-classified feed would have produced cleaner-looking output while hiding the
part that actually teaches you the instrument: seeing what an artifact looks
like, learning which are recoverable by rejection and which mean the recording
has to be redone, and understanding how much of the result is decided at
electrode placement.

## Results

Working familiarity with electrode placement, artifact identification and
rejection, and interpretation of raw biopotential data. I demonstrated the kit
to attendees at the **El Paso Science Festival 2026**, which is its own test of
understanding: explaining what the trace shows to someone seeing EEG for the
first time.

## Limitations and what is next

This is instrument familiarity, not a decoding result. The honest next step is
a closed-loop task, where a feature extracted from the signal drives something
observable, which is where the artifact-rejection work stops being academic.
