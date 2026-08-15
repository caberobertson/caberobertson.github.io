---
title: BLDC Blower Characterization and Airflow DoE
outcome: Reverse-engineered a commercial BLDC blower, added speed control it shipped without, and found a configuration that cut noise ~10 dB while raising airflow 20%.
status: complete
period: Mar 2026 - May 2026
order: 4
audiences: [bigtech, defense]
context: GILZ LLC
role: Electrical Engineering Intern
tags: [ESP32, BLDC, PWM, Design of Experiments, Acoustics]
metrics:
  - { value: "~10 dB", label: "acoustic noise reduction" }
  - { value: "+20%", label: "airflow versus stock" }
  - { value: "3", label: "user-selectable speeds added" }
artifacts: []
figure: doe
figureData:
  caption: "Factors swept against the four responses measured on every run."
  factors: ["Duct configuration", "Filter configuration", "Commanded PWM speed"]
  responses: ["Airflow", "Acoustic noise", "Temperature", "Air velocity"]
---

## Problem and context

An air-filtration prototype needed a blower whose electrical behaviour was
known, but the candidate was a commercial desk unit with no published drive
specification and no speed control at all.

## Constraints

The motor could not be replaced, so whatever drive specification came out of
characterization was the specification. Measurements had to be made on a bench
with an anemometer, thermocouple, and sound level meter rather than in an
anechoic chamber, which bounds how finely acoustic differences can be resolved.

## Design and tradeoffs

I reverse-engineered the blower to characterize the internal BLDC motor's
voltage and current ratings and its PWM response, which defined the drive
specification for the prototype. On that basis I programmed an **ESP32 PWM
controller in C** giving three user-selectable speeds, so a unit that shipped
with a single fixed speed became adjustable.

The measurement approach was the important decision. Rather than tuning by ear
and picking a configuration that felt better, I ran a **benchtop design of
experiments**: duct and filter configurations swept against four responses,
every run measured the same way. That costs far more bench time than
one-factor-at-a-time tweaking, and it is the only reason the result can be
stated as a number instead of an impression.

## Results

The sweep identified a configuration that cut acoustic noise by roughly
**10 dB** and raised airflow **20%** against the stock fan, with three
user-selectable speeds added to a unit that had none.

## Limitations and what is next

The measurements were taken on a bench, not in an anechoic chamber, so the
absolute noise figures carry room effects; the ~10 dB is a comparison between
configurations measured identically, which is the claim that matters here. The
per-run data is not published, so the figure above shows the experiment's
structure rather than its raw values.
