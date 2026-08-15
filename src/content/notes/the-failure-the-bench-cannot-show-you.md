---
title: The failure the bench cannot show you
summary: The demonstrator passed every indoor test and then fell over in front of clients. Wind is not a bench condition.
date: 2025-07-22
tags: [Field Test, Hardware, Cost Engineering]
project: RF Communication-Jamming Demonstrator
projectHref: /projects/rf-jamming-demonstrator.html
---

The kit worked. Indoors, on a table, it worked every time. Outdoors, in front
of law-enforcement and defense clients, wind knocked it over mid-presentation.

No amount of additional bench testing would have found that, because the bench
does not have wind in it.

## The constraint that made the obvious fix wrong

The instinctive answer is mass. Add weight, lower the centre of gravity, done.
But the entire reason the kit existed was portability: it replaced a roughly
$500 setup with a $219 one specifically so more kits could exist and more
demonstrations could run in parallel. A kit you need two people to carry is not
a cheaper kit, it is a different product.

So the fix had to be a lightweight stabilizing change rather than ballast. It
held through outdoor demonstrations in high wind, with no further tip-overs.

## On where the cost actually went

The $219 figure came from attacking the cost driver, not from shaving a
percentage off every line. The expensive elements of the previous setup were
replaced with parts that could be reordered and rebuilt from a list, and the
demonstration itself stayed equivalent.

That is worth being precise about, because it bounds the claim: the saving is
in part selection, not in the RF hardware. It does not generalize to the
system. The kit also looks less finished than a machined enclosure would, which
is the tradeoff that was consciously accepted for rebuildability.

## What I took from it

Test in the environment the thing will actually live in, as early as you can
get there. The failure modes that matter are the ones your test setup is
structurally incapable of producing, and you will not reason your way to them
from a bench.
