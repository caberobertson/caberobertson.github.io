---
title: A stationary board reading 14 to 17 g
summary: The vendor driver applied double the datasheet scale factor and sampled the three axes at different instants.
date: 2026-04-18
tags: [MPU6050, I2C, Firmware, Debugging]
project: MYOSA CrashGuard
projectHref: /crashguard.html
---

The board was sitting still on a bench and the firmware was reporting between
14 and 17 g, with the number changing depending on which way the board faced.
A still object reads 1 g in every orientation, so either the part was defective
or something between the part and my code was wrong. It was the vendor library.

## What reading the source turned up

The library exposes one accessor per axis, which is the obvious way to use it.
Three properties make those accessors unusable at 100 Hz:

- **Each accessor re-reads the full-scale range configuration register before
  returning a value.** Three axes therefore cost three configuration reads plus
  three data reads, tripling I2C traffic at the sample rate I needed and
  returning intermittently corrupted samples once the bus got busy.
- **The three axes are read in three separate transactions**, so they
  correspond to three different instants. Their vector magnitude is not
  physically meaningful during rapid motion.
- **The scale factor is wrong by a factor of two for every range.** The library
  applies 2^(fsr+1) where the datasheet specifies 2^fsr.

The last one explains the 14 to 17 g reading. Double the scale factor, add axes
sampled at different moments, and a stationary board reports a number that
moves when you rotate it.

## The fix

One six-byte I2C burst read, so all three axes come from the same instant, and
the datasheet sensitivity of 2048 LSB/g at plus or minus 16 g applied directly
to the raw counts. No accessors, no re-reads, no per-axis skew.

The stationary reading became 1.00 g in every orientation.

The accessors are fine for a hobby project polling at 5 Hz, and nothing in the
documentation says where that limit is. When a sensor reports something
physically impossible, check the code path before suspecting the part.
