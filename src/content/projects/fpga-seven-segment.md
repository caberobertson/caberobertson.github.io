---
title: FPGA Seven-Segment Display Driver
outcome: A VHDL display driver decoding all 16 BCD/HEX inputs, with the Boolean logic minimized by hand.
status: complete
period: "2025"
order: 9
audiences: [bigtech]
tags: [VHDL, FPGA, Digital Logic, Karnaugh Maps]
metrics:
  - { value: "16", label: "input codes decoded, 0-9 and A-F" }
artifacts: []
figure: none
---

## Problem and context

A seven-segment display driver is the standard first real FPGA exercise: map
each of sixteen input codes to the seven segment outputs that render it.

## Constraints

The design had to cover the full hexadecimal range, not just the decimal digits,
and target the board's available logic.

## Design and tradeoffs

The mapping was written in **VHDL** and the Boolean expression for each segment
minimized using truth tables and **Karnaugh maps** before it was coded, rather
than left for the synthesiser to optimize. On a design this small the synthesised
result would be similar either way; doing it by hand is the point of the
exercise, and it makes the relationship between the truth table and the gate
count explicit.

## Results

A working driver decoding all **16 BCD/HEX inputs** (0-9, A-F) on the FPGA, with
each segment's logic reduced to a minimized expression.

## Limitations and what is next

It is a combinational decoder with no multiplexing, so driving several digits
would need a scan counter and per-digit enables.
