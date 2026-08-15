---
title: Autonomous Obstacle Avoidance
outcome: An obstacle-avoidance control loop refined over repeated trials to a 100% avoidance rate in testing.
status: complete
period: "2025"
order: 8
audiences: [bigtech, defense]
tags: [Arduino, C++, Ultrasonic Sensors, Control Logic]
metrics:
  - { value: "100%", label: "obstacle-avoidance rate in testing" }
artifacts: []
figure: none
---

## Problem and context

A mobile robot navigating without a map has to decide what to do about an
obstacle using only what its sensors can see at that instant.

## Constraints

Ultrasonic sensing gives range along a narrow cone with no information about
what lies outside it, and readings are noisy near reflective or angled
surfaces, so the control logic has to tolerate individual bad measurements.

## Design and tradeoffs

The avoidance logic was written in **C++ on Arduino** and refined empirically
over repeated trials against varying hurdles, rather than derived from a model
of the platform. For a robot this simple that is the right trade: the tuning
loop is minutes long, so measured behaviour beats a model that would need
validating anyway.

## Results

A **100% obstacle-avoidance rate** across the test set, reached by iterating the
control logic against physical trials rather than in simulation.

## Limitations and what is next

100% is against the obstacles it was tested on, which is a statement about the
test set as much as the robot. Glass, low obstacles below the sensor cone, and
sharply angled surfaces are the known failure modes, and they are where a second
sensing modality would earn its place.
