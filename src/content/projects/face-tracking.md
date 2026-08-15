---
title: Real-Time Face Tracking
outcome: A computer-vision pipeline that detects faces and drives pan-tilt servos over serial to keep the subject centered at 30 FPS.
status: complete
period: "2025"
order: 7
audiences: [bigtech, neurotech]
tags: [Python, OpenCV, Arduino, Pan-Tilt Servos, Serial]
metrics:
  - { value: "~30 FPS", label: "sustained on constrained hardware" }
artifacts:
  - { label: "Demo video", href: "https://www.youtube.com/watch?v=a23yNcI4UtQ" }
figure: video
figureData:
  caption: "The tracker holding a subject centered under pan-tilt control."
  videoId: a23yNcI4UtQ
  title: Face tracking project demo
---

## Problem and context

Detecting a face in a frame is a solved problem; keeping a physical camera
pointed at one is not, because the loop has to close fast enough that the
subject has not moved by the time the servos respond.

## Constraints

The pipeline had to sustain a usable frame rate on constrained hardware while
sharing time with serial communication, and the mechanics had to be driven
without the servos hunting around the target.

## Design and tradeoffs

Detection runs in **Python with OpenCV**, and positional error is streamed over
serial to an **Arduino** that drives the pan-tilt mechanism. Splitting the work
this way keeps vision on the host, where it belongs, and keeps servo timing on a
microcontroller, where jitter is bounded. The cost is a serial link in the
control loop, which is why the message format is kept minimal.

## Results

A real-time tracking pipeline sustaining roughly **30 FPS** on constrained
hardware, holding the subject centered under live pan-tilt control.

## Limitations and what is next

It tracks a face, not a specific person, and loses the target when the face
turns far enough away from the camera. Adding a simple motion model would let it
coast through brief detection dropouts instead of stopping.
