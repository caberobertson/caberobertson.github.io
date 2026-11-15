---
title: Synthetic Inspection Data in Isaac Sim
outcome: Generating synthetic training data of meteoroid crater damage on satellites in NVIDIA Isaac Sim, used to train a model for autonomous inspection and maintenance.
status: active
period: 2026 - Present
order: 2
audiences: [bigtech, defense]
context: Emerging Technology Ventures (ETV America)
tags: [NVIDIA Isaac Sim, Synthetic Data Generation, Simulation, Autonomous Inspection]
metrics: []
artifacts:
  - { label: "Run the model", href: "#model" }
  - { label: "All four labs", href: "/lab.html" }
lab: sdg
figure: none
releasabilityNote: >-
  REVIEW BEFORE ADDING ANYTHING. The only statement of the ETV work on this
  page is the resume line: Isaac Sim, synthetic training data, meteoroid crater
  damage on satellites, for the company's autonomous inspection and maintenance
  model. No scene, asset, sensor or renderer setting, dataset size, model
  architecture, or result is published, and none should be added without ETV's
  sign-off. The interactive model is a generic teaching illustration written
  for this site and contains nothing from the company's pipeline. Confirm with
  ETV that naming the subject (meteoroid crater damage on satellites) is itself
  cleared for a public page; it is taken from the resume as written.
---

## Problem and context

A model that inspects a satellite for meteoroid damage has to be trained on
examples of that damage. Photographs of real craters on real spacecraft are
scarce, and nobody can go and collect more. At ETV America I use **NVIDIA Isaac
Sim** to generate that training data synthetically, for the company's
autonomous inspection and maintenance model.

## Why simulate it

In a simulated scene, the position, size and shape of every crater is known
before the frame is rendered, so each image is saved with labels that are exact.
Hand labelling, usually the slowest and least reliable part of building a
dataset, is no longer needed. The same scene can also be rendered again under
different lighting and from different viewpoints, which is how a dataset comes
to cover conditions that would be rare or impossible to photograph.

## The workflow, and the model on this page

Whatever the subject, synthetic data generation has three parts: a scene to
render, a set of properties that change from frame to frame, and a writer that
saves each frame together with its annotations.

The interactive model above runs that loop at small scale. It draws cratered
panels in the browser, varies them, and shows the record written beside each
image, so the idea can be tried directly. It is a teaching illustration I wrote
for this site. No scene, asset, parameter or output from ETV's pipeline appears
in it.

## Where it stands

In progress. Dataset details and model results belong to ETV and are not
published here.
