---
title: The failure the bench cannot show you
summary: The demonstrator passed every indoor test, then tipped over the first time I took it outside on a windy day. Wind is not a bench condition.
date: 2025-07-22
tags: [Field Test, Hardware, Cost Engineering]
project: RF Communication-Jamming Demonstrator
projectHref: /projects/rf-jamming-demonstrator.html
---

The kit worked indoors, on a table, every time. The first time I took it
outside for normal testing on an unusually windy day, the wind knocked it over.
More bench testing would never have found it, and the only reason it did not
happen in front of a client is that the testing came first.

## Why the obvious fix was wrong

The instinctive answer is mass: add weight and lower the center of gravity. But
the kit existed to be portable. It replaced a roughly $500 setup with a $219
one so that more kits could exist and more demonstrations could run in
parallel, and a kit that takes two people to carry gives that up.

So the fix was a lightweight stabilizing change rather than ballast. It held
through the rest of outdoor testing in high wind with no further tip-overs, and
the kit was later demonstrated outdoors without one.

## Where the cost actually went

The $219 figure came from attacking the cost driver rather than shaving a
percentage off every line. The expensive elements of the previous setup were
replaced with parts that could be reordered and rebuilt from a list, and the
demonstration itself stayed equivalent.

That bounds the claim: the saving is in part selection, not in the RF hardware,
so it does not generalize to the system. The kit also looks less finished than
a machined enclosure would, which was the tradeoff accepted for
rebuildability.

Test in the environment the hardware will actually work in, as early as you can
get there. A bench cannot produce wind, and no amount of bench time
substitutes.
