---
title: A threshold that can never fire
summary: The detection threshold was set at 50 g on a sensor that saturates at 27.7 g. The number was not aggressive, it was unreachable.
date: 2026-05-02
tags: [Sensor Fusion, Detection, MPU6050, Requirements]
project: MYOSA CrashGuard
projectHref: /crashguard.html
---

An early version of the detection logic declared a crash above 50 g. It sounds
like a defensible, conservative number. It is not a number at all, because the
sensor cannot produce it.

## The arithmetic

The MPU6050 is configured for a full-scale range of plus or minus 16 g **per
axis**. Each axis clips at 16 g. The largest magnitude the part can ever
report is the case where all three axes are simultaneously pinned:

```
|a|max = sqrt(16^2 + 16^2 + 16^2) = 16 * sqrt(3) ~= 27.7 g
```

27.7 g is the ceiling, and it is only reachable in the one contrived
orientation where the impact loads all three axes equally. A 50 g threshold is
not conservative. It is a branch that can never be taken. The system would have
sat through every real crash reporting nothing.

## What replaced it

Two changes, and the second one is the one that mattered.

**Subtract the gravity vector, not its magnitude.** During a still boot the
firmware averages one hundred samples to record g0, then computes

```
d(t) = ( a(t) - g0 ) / |g0|
```

Removing the whole vector rather than its length means the output reads 0.00 g
at rest in *any* orientation. Magnitude-only normalization leaves a
mounting-angle-dependent offset buried inside the threshold, which means the
threshold silently means something different depending on how the board is
bolted in.

**Set the threshold from what handling can produce.** Rotating the sensor by
hand generates at most about 2 g of apparent dynamic acceleration. Anything
above 2 g is therefore unreachable by ordinary handling. The threshold is
5.0 g of dynamic acceleration: comfortably clear of the handling floor,
comfortably under the 27.7 g ceiling, and inside the range the part can
actually resolve.

## Why the second version is honest

The 5.0 g number is defensible in a way the 50 g number never was, because it
is bounded on both sides by measurable quantities: what a human hand can
produce, and what the sensor can report. A threshold you cannot justify against
both bounds is a guess wearing a unit.

Two supporting mechanisms exist because a threshold alone is not a detector: a
median-of-three filter discards isolated outlier samples from bus glitches or
transient saturation, and the event has to persist across consecutive samples
before it is declared. GPS plays no part in the decision. It supplies location
for the call, and nothing else.

## What I took from it

Sanity-check every threshold against the instrument's range before tuning it.
It takes one line of arithmetic and it is the difference between a detector and
a decoration.
