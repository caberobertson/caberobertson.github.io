---
title: Linear-Algebra Channel Decoding Simulations
outcome: Python simulations validating bit-error-rate performance across encoding schemes under noise, with publication-quality figures automated in MATLAB.
status: complete
period: Aug 2025 - Feb 2026
order: 5
audiences: [bigtech, defense]
context: Mitchell Coding Group, NMSU
role: Research Assistant
tags: [Python, MATLAB, Channel Coding, BER Analysis, Linear Algebra]
metrics:
  - { value: "7 months", label: "independent research, reporting to the PI" }
  - { value: "Multi-hour", label: "experiment runs, automated end to end" }
artifacts: []
figure: images
figureData:
  caption: "Publication-quality figures produced by the automated MATLAB pipeline."
  images:
    - { src: "/plot1.jpg", alt: "MATLAB plot of channel decoding simulation results", width: 1012, height: 643 }
    - { src: "/plot2.jpg", alt: "MATLAB plot visualising experimental results", width: 973, height: 632 }
---

## Problem and context

Whether a channel code performs as theory predicts is answered by measuring bit
error rate across encoding schemes under noise, over enough trials that the tail
of the distribution is populated rather than guessed at.

## Constraints

Runs took multiple hours each, so anything requiring a human to babysit a run,
transcribe a result, or hand-plot a figure would have bounded how many
conditions could be explored. I worked independently on an assigned research
question over seven months, reporting results to the principal investigator.

## Design and tradeoffs

I developed the decoding simulations in **Python**, expressing the decoder in
linear-algebra terms so encoding schemes could be swapped without rewriting the
harness. Experiments were then automated over contrasting input bit-strings to
verify decoder reliability under varied conditions.

The deliberate investment was in **automating statistics and plotting in
MATLAB** rather than producing figures by hand. Automating the pipeline is
slower for the first figure and faster for every one after, and it removes the
transcription errors that creep in when results are moved by hand.

## Results

Bit-error-rate performance validated across multiple encoding schemes under
noise, with multi-hour experiment campaigns run unattended and
publication-quality figures generated directly from the result data.

## Limitations and what is next

This was simulation, not over-the-air measurement, so it validates the decoder
against a channel model rather than against a real radio. Comparing against
captured RF would be the natural extension.
