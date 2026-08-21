---
title: A threshold that can never fire
summary: The detection threshold was set at 50 g on a sensor that saturates at 27.7 g, so the branch could never be taken.
date: 2026-05-02
tags: [Sensor Fusion, Detection, MPU6050, Requirements]
project: MYOSA CrashGuard
projectHref: /crashguard.html
---

An early version of the detection logic declared a crash above 50 g. The
MPU6050 it runs on cannot report 50 g, so that branch could never be taken.

## The arithmetic

The part is configured for a full-scale range of plus or minus 16 g **per
axis**. Each axis clips at 16 g, so the largest magnitude it can report is the
case where all three are pinned at once:

```
|a|max = sqrt(16^2 + 16^2 + 16^2) = 16 * sqrt(3) ~= 27.7 g
```

27.7 g is the ceiling, and it only occurs in the one orientation where an
impact loads all three axes equally. At a 50 g threshold the system would have
sat through every real crash reporting nothing.

## What replaced it

**Subtract the gravity vector, not its magnitude.** During a still boot the
firmware averages one hundred samples to record g0, then computes

```
d(t) = ( a(t) - g0 ) / |g0|
```

Removing the whole vector rather than its length means the output reads 0.00 g
at rest in any orientation. Magnitude-only normalization leaves a
mounting-angle-dependent offset inside the threshold, so the same number means
something different depending on how the board is bolted in.

**Set the threshold from what handling can produce.** Rotating the sensor by
hand generates at most about 2 g of apparent dynamic acceleration, so anything
above that cannot be reached by ordinary handling. The threshold is 5.0 g of
dynamic acceleration, which clears the handling floor and sits well under the
27.7 g ceiling.

## The rest of the detector

A threshold on its own is not enough. Readings pass through a median-of-three
filter that discards isolated outliers from bus glitches or transient
saturation, and the event has to persist across consecutive samples before a
crash is declared. GPS plays no part in the decision; it supplies location for
the call only.

Check a threshold against the instrument's range before tuning it. It is one
line of arithmetic.
