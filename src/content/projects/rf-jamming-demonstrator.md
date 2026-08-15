---
title: RF Communication-Jamming Demonstrator
outcome: A portable $219 field demonstration kit for an RF jamming system, roughly 56% cheaper than the $500 setup it replaced.
status: complete
period: Apr 2025 - Aug 2025
order: 3
audiences: [defense]
context: Syndetix Incorporated
role: Hardware Engineering Intern
tags: [RF Systems, Hardware Prototyping, Field Test, Technical Writing]
metrics:
  - { value: "$219", label: "delivered kit cost" }
  - { value: "~56%", label: "cheaper than the prior setup" }
  - { value: "0", label: "tip-over failures after the fix" }
artifacts: []
figure: cost
figureData:
  caption: "Delivered kit cost against the setup it replaced."
  unit: "USD"
  bars:
    - { label: "Prior setup", value: 500 }
    - { label: "This kit", value: 219 }
releasabilityNote: >-
  Outcomes and cost only. No RF parameters, frequencies, effective ranges, or
  system capabilities are published. Confirm with Syndetix before adding media.
---

## Problem and context

An RF communication-jamming system is difficult to sell without showing it
working, and it was being demonstrated to law enforcement and defense clients
with a setup that cost about $500 to assemble. That price limited how many kits
could exist, which limited how many demonstrations could run in parallel.

## Constraints

The kit had to be **portable**, assembled from parts that could be reordered and
rebuilt without special fabrication, cheap enough to duplicate, and reliable
enough to survive live client demonstrations outdoors, where conditions are not
controlled.

## Design and tradeoffs

The design targeted the cost driver rather than shaving margin across the board:
replacing the expensive elements of the previous setup with parts that were
easily producible, while keeping the demonstration itself equivalent. The
tradeoff accepted was a kit that looks less finished than a machined enclosure
but can be rebuilt from a parts list.

Field testing surfaced a failure the bench never would: wind was knocking the
demonstration over mid-presentation. Rather than adding mass, which would have
worked against portability, I engineered a lightweight stabilizing fix, keeping
the payload operational through outdoor demonstrations in high wind.

## Results

A **$219** portable field demonstration kit, roughly **56% cheaper** than the
$500 setup it replaced, that eliminated tip-over failures during live client
demonstrations. I also authored the product user manual, standardizing setup,
operation, and RF handling procedures for mission and training use.

## Limitations and what is next

The cost reduction came from part selection, not from redesigning the RF
hardware, so it does not generalize to the system itself. The obvious next step
is a repeatable enclosure that keeps the parts-list rebuildability while looking
closer to a product in front of a customer.
