---
title: The sensor was fine. The library was wrong.
summary: A still board reporting 14 to 17 g is not a noise problem. Reading the vendor driver's source turned a "broken" MPU6050 into a reliable one.
date: 2026-04-18
tags: [MPU6050, I2C, Firmware, Debugging]
project: MYOSA CrashGuard
projectHref: /crashguard.html
---

The board was sitting still on a bench and the firmware was reporting between
14 and 17 g. Worse, the number changed depending on which way the board faced.
A still object experiences 1 g, in every orientation, always. So either the
part was defective or something between the part and my code was lying.

It was the library.

## What reading the source turned up

The vendor library exposes one accessor per axis, which is the obvious way to
use it and the reason nobody looks further. Three properties make those
accessors unusable at 100 Hz:

- **Each accessor re-reads the full-scale range configuration register before
  returning a value.** Three axes therefore cost three configuration reads plus
  three data reads, tripling I2C traffic at the sample rate I needed and
  returning intermittently corrupted samples once the bus got busy.
- **The three axes are read in three separate transactions**, so they
  correspond to three different instants. Their vector magnitude is not a
  physically meaningful quantity during rapid motion. It is three unrelated
  numbers under a square root.
- **The scale factor is wrong by a factor of two for every range.** The library
  applies 2^(fsr+1) where the datasheet specifies 2^fsr.

That last one is the whole 14-to-17 g mystery. Double the scale factor, add
axes sampled at different moments, and a stationary board reports a number that
moves when you rotate it.

## The fix

One six-byte I2C burst read, so all three axes come from the same instant, and
the datasheet sensitivity of 2048 LSB/g at plus or minus 16 g applied directly
to the raw counts. No accessors, no re-reads, no per-axis skew.

The stationary reading became 1.00 g in every orientation.

## What I took from it

A vendor library being convenient does not make it correct at the rate you
need. The accessors are probably fine for a hobby project polling at 5 Hz; they
are not fine for crash sensing at 100 Hz, and nothing in the documentation
tells you where that line is. Reading the source is what found it.

The general version: when a sensor reports something physically impossible,
suspect the code path before the silicon. Physics is not usually the thing
that broke.
