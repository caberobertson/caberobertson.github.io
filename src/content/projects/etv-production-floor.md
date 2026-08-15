---
title: Unmanned Systems Production Floor
outcome: Stood up a company's UAS production floor end to end, from AutoCAD layout to an audit-ready procurement package.
status: active
period: Jul 2026 - Present
order: 2
audiences: [defense]
context: Emerging Technology Ventures (ETV America)
role: Solely responsible for the buildout
tags: [Unmanned Systems, AutoCAD, Procurement, Blue UAS / NDAA, NASA SBIR]
metrics:
  - { value: "$168K", label: "capital equipment and production BOM" }
  - { value: "59", label: "line items sourced and specified" }
  - { value: "7", label: "person turnkey build area delivered" }
  - { value: "$2.5M", label: "NASA SBIR/STTR proposal co-authored" }
artifacts: []
figure: pipeline
figureData:
  caption: "Scope of the buildout, from empty floor to staff move-in."
  stages:
    - { label: "Layout", detail: "AutoCAD equipment plan" }
    - { label: "Services", detail: "tooling and power spec" }
    - { label: "Vendors", detail: "Blue UAS / NDAA qualification" }
    - { label: "Procurement", detail: "59-line BOM, ~$168K" }
    - { label: "Handover", detail: "7-person build area" }
releasabilityNote: >-
  Describes outcomes and process only. No drawings, vendor lists, part numbers,
  or system capabilities are published. Confirm releasability with ETV before
  adding any media or technical detail to this page.
---

## Problem and context

A production floor for unmanned systems has to exist physically before anything
can be built on it: benches and equipment placed, power and tooling specified,
vendors qualified, and every item bought through a paper trail an auditor can
follow. I was the only engineer assigned to that effort.

## Constraints

Every component had to come from a **Blue UAS Framework / NDAA-compliant**
vendor, which narrows the supplier set considerably and makes sourcing, not
selection, the hard part. The procurement package had to import cleanly into
QuickBooks Enterprise, so the BOM had to be structured for accounting from the
start rather than reformatted afterwards. The end state was fixed: a turnkey
area ready for seven people to move into.

## Design and tradeoffs

The layout was drawn in AutoCAD so equipment placement, clearances, and power
drops were resolved on paper before anything was ordered. Specifying tooling and
power alongside the layout, rather than after it, meant the electrical
requirements were known while the floor plan could still change.

Structuring the BOM as an audit-ready import was a deliberate choice: it costs
more effort up front than a spreadsheet, and it is the reason the package could
be handed to finance without a translation step.

## Results

A **59-line-item, roughly $168K** capital equipment and production BOM, sourced
entirely to compliant vendors and delivered as an audit-ready QuickBooks
Enterprise import, and a **turnkey 7-person build area** ready for staff
move-in.

Alongside the floor work I co-authored a **30-page NASA SBIR/STTR (CCRPP)
proposal** seeking a $2.5M matching award for an autonomous on-orbit inspection
and repair system, and was selected by company leadership to pitch at the
**NASA Moon to Mars Summit** (Huntsville, AL, Sept 2026) on licensing NASA's
VIPIR robotic inspection payload into company flight hardware, competing for a
$10,000 award.

## Limitations and what is next

This page is deliberately thin on specifics. The work is for a defense customer,
so equipment lists, vendor identities, and layout drawings stay out of a public
portfolio. What generalizes is the method: resolve layout and services together,
qualify the supply chain before committing, and build the paper trail into the
BOM rather than bolting it on.
