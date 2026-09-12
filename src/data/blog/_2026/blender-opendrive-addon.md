---
title: Blender OpenDRIVE Add-on - A Curve-Based .xodr Editor Where Every Bezier Is a paramPoly3
description: How I built a Blender OpenDRIVE add-on - a curve-based .xodr editor that exports road networks as paramPoly3, with lane sections, junctions, and ASAM schema validation.
pubDatetime: 2026-09-11T10:00:00Z
modDatetime: 2026-09-11T10:00:00Z
author: Denis Iakimenko
slug: blender-opendrive-addon
featured: false
draft: false
tags:
  - opendrive
  - xodr
  - blender
  - asam
  - python
  - road-network
  - simulation
  - carla
  - gamedev
  - autonomous-driving
  - bezier
  - maps
---

## Table of contents

## Introduction

The [previous post on OpenDRIVE map creation](/blog/opendrive-map-creation) ended on advice I then refused to take: switch to a real editor the moment junctions appear. So I switched, drew one junction, exported the `.xodr`, and spent the evening reading the XML wondering where my curve had gone. The reference line had become a chain of arcs and spirals fitted to what I had drawn, which is close to the same shape without being the same shape. Nudging one control point changed how many primitives came out the other end.

Then I noticed the thing that turned a complaint into a weekend project. A cubic Bezier is a cubic parametric polynomial, and OpenDRIVE has a geometry primitive that is exactly a cubic parametric polynomial: `paramPoly3`. Blender's curve editor draws cubic Beziers, so nothing has to be fitted between the two. All that separates them is a change of basis.

So the Blender OpenDRIVE add-on that came out of that weekend is not a road editor with a Blender front end. It is the opposite: Blender curves *are* the roads, the sidebar attaches OpenDRIVE semantics to them, and the `.xodr` export writes the curve that is on screen with no approximation anywhere in the path. What that bought me is the rest of this post, feature by feature, along with the places where refusing to approximate cost more work than fitting ever would have.

> It writes [ASAM OpenDRIVE 1.9](https://www.asam.net/standards/detail/opendrive/) road networks, runs on Blender 4.2+ / 5.x, and is GPL-3.0: roughly 200 KB of Python across ten modules, plus a headless test suite.

## One idea: a Blender curve is the OpenDRIVE reference line

A road is a Blender curve object. Its **first spline**, in world space, in the spline's own direction, is the reference line, and that direction is `s`. Everything else in the sidebar is a function of it, exactly as [the format models it](/blog/opendrive-map-creation).

Each Bezier segment between two control points becomes one `<paramPoly3>`. The conversion is a basis change from Bernstein to power basis, done in the geometry's local frame. The spec puts that frame's origin at the segment start, with `u` along the start heading and `v` to the left:

```python file=geometry.py
def _poly_coeffs(pts, hdg):
    """Bezier → power basis in the local frame (origin P0, rotated by -hdg)."""
    cos_h, sin_h = math.cos(hdg), math.sin(hdg)
    local = []
    for p in pts:
        dx, dy = p.x - pts[0].x, p.y - pts[0].y
        local.append((dx * cos_h + dy * sin_h, -dx * sin_h + dy * cos_h))
    (u0, v0), (u1, v1), (u2, v2), (u3, v3) = local
    return (
        0.0, 3 * (u1 - u0), 3 * (u0 - 2 * u1 + u2), -u0 + 3 * u1 - 3 * u2 + u3,
        0.0, 3 * (v1 - v0), 3 * (v0 - 2 * v1 + v2), -v0 + 3 * v1 - 3 * v2 + v3,
    )
```

Twelve lines, and the exported road is the curve on screen down to the last bit of float. Nothing is fitted, nothing is sampled, and there is no export resolution setting to get wrong, because no resolution is involved anywhere. The number of control points going in decides the number of geometry elements coming out.

Two deliberate exceptions to the one-to-one rule:

- A Bezier whose handles lie on its own chord, between the endpoints and in order, is the chord. That exports as `<line>` rather than as a cubic with zero curvature coefficients. Same curve either way, but every reader has a fast path for `<line>` and some have bugs in the other one.
- POLY splines export as one `<line>` per point pair. A NURBS spline is refused by the validator, because its control polygon is not the curve you see on screen, and writing that polygon out quietly would misreport the road.

:::info
This is also why the add-on has no "spiral" option and never will. A clothoid is not a cubic polynomial, so offering one would mean adding exactly the fitting step the whole design exists to avoid. If your consumer needs clothoids for curvature continuity then this is the wrong tool, and if it needs the road you actually drew then the trade went the right way.
:::

### Arc length: where an exact paramPoly3 gets expensive

`paramPoly3` has one hostile property: the parameter is not arc length. OpenDRIVE keys everything to `s` in metres. So the add-on needs `s → p` and `p → s` at every point where a lane width, a lane section, a signal or a junction end is evaluated.

```mermaid caption=Every s in the panel is two numerical solves away from the curve
graph TD
    S[s in metres] --> N[Newton with bisection fallback: find p]
    N --> Q[Gauss-Legendre 8-point: arc length of p]
    Q --> N
    N --> P[point, heading, grade at s]
```

Arc length is 8-point Gauss-Legendre quadrature, good to about 1e-12 on a cubic. The inverse is Newton, but Newton alone on a curve with a near-cusp handle configuration will happily walk out of its own segment, so the bracket is maintained and a step outside it falls back to bisection. It converges in a handful of iterations and never needs a lookup table.

The reverse direction, world XY to `(s, t)`, is what places signals and objects: 24 coarse samples per segment, then golden-section refinement, with one wrinkle worth naming. The coarse winner can sit on a seam while the true nearest point is just inside the neighbouring segment, whose own coarse samples are `1/24` of *its* length apart and therefore coarser on a long segment. So the neighbours get refined too and the closest of the three wins.

## The OpenDRIVE elevation profile is the Z you already dragged

There is no separate elevation editor. The control points' Z is the elevation profile: per Bezier segment, one `<elevation>` cubic in `s`, Hermite-fitted through the two end heights and the two end slopes. That is C1 across the whole road and exact at every control point. A curve whose Z is all zero writes no `<elevationProfile>` element at all.

One trap, and the comment in the source is there because I fell in it:

:::warn
"Straight" is read in plan only. A road that is straight on the map but crests or dips still exports its `<line>`, and its vertical curve then has to come from the four Z values of the Bezier rather than from the two endpoints the `<line>` kept. Fit the elevation on the two endpoints and every vertical curve on every straight road silently flattens on export. The geometry collapses to a line; the elevation profile does not.
:::

## Five roles in one Blender sidebar: road, junction, signal, controller, object

Select anything, and the **Road** panel's `kind` field says what it is in the network. That is the entire object model:

| kind | Blender object | Exports as |
| ---- | -------------- | ---------- |
| Road | a curve | `<road>`, whose first spline, in its direction, is the reference line |
| Junction | an empty | `<junction>`; the empty is only where the label is drawn |
| Signal | anything | `<signal>` on a road; `s`/`t` projected from its position |
| Controller | an empty | `<controller>` with its `<control>`s, plus the `<junction>` reference |
| Object | anything | `<object>` on a road; `s`/`t` projected from its position |

You place signals and objects by moving them. `s` in the panel is a live property: reading it projects the object onto the road's reference line, writing it moves the object to that `s` keeping its lateral offset. The object's transform stays the single source of truth, so grabbing a traffic light and sliding it up the street is the same edit as typing `s = 42.5`.

## Lane sections, lane widths, and lane ids you never type

The Lanes panel holds the lane sections along `s`, and per section a right list and a left list. Lane ids come from list order and are never stored: right lanes count `-1, -2…` outward, left lanes `1, 2…`, and the centre lane 0 is implicit. Reorder the list and the ids follow it. This is the one place where the add-on refuses to let you repeat the classic mistake from the last post, because skipped or renumbered lane ids cannot be expressed at all.

Per lane: type, `level`, lane predecessor/successor ids (comma-separated, so a merge or a split is `-1, -2`), speed, access restriction, direction, width polynomials, and road marks. The centre line takes any number of marks along the section, including none.

"Add section at the 3D cursor" projects the cursor onto the road, inserts a section at that `s`, and copies the lane layout from the section before it. The collection stays sorted by `s`, so the list reads top to bottom the way the road does.

Width is the standard's cubic, and boundaries at any `s` are the running sum of widths outward from the lane offset. One function, shared by the exporter, the overlay and the junction helpers, which is the only reason they agree:

```python file=lanes.py
def boundaries(obj, refline, s):
    """(center_t, left_ts, right_ts): outer edge of each lane at s."""
    road = obj.xodr
    section = section_at(road, s)
    center = lane_offset_at(road, s)
    if section is None:
        return center, [], []
    ds = s - section.s
    left, t = [], center
    for lane in section.left_lanes:
        t += width_at(lane, ds)
        left.append(t)
    right, t = [], center
    for lane in section.right_lanes:
        t -= width_at(lane, ds)
        right.append(t)
    return center, left, right
```

## The viewport overlay: reading the .xodr on the curve

A bare curve says nothing about its lanes, and a number in a panel is invisible where it matters. So the network is drawn on the curves: one translucent band per lane, as wide as its width polynomial says at that `s`, right lanes blue and left lanes orange, each lane further out a little fainter, tinted by lane type. The centre line and every lane boundary is drawn in its road mark's colour, dashed where the mark is broken, and a faint grey edge where no mark is painted at all, so junction interiors stay readable instead of turning into a white thicket. Junction connections are arcs from the incoming lane to the connecting lane. Ids and names are screen-space text.

This is the feature that changed how the add-on feels to use. A lane whose width polynomial goes negative at 60 m is an abstract validator message; a band that pinches shut and flips inside out is something you see from across the viewport.

The implementation notes worth stealing if you write Blender overlays:

- Two draw handlers, because the two halves live in different spaces. Bands, lines and arcs are world geometry (`POST_VIEW`), while text is `POST_PIXEL` so it keeps its size at any zoom.
- Nothing is recomputed per frame. Bands, arcs and label positions are cached per object, and the GPU batches that merge them rebuild only when the visible set or the overlay settings change.
- Caches are dropped by the signals after which they could be lying. A depsgraph update of a road, curve, signal or object drops only that object's entry, while undo, redo and file load drop all of them.
- Draw handlers have to be `@persistent`, or Blender silently removes them on the next file load.
- Catch `ReferenceError` and nothing else. An undo can hand a redraw a dead datablock, but a handler that lets any other exception escape is removed by Blender permanently, taking your overlay with it until you re-enable the add-on.

## OpenDRIVE junctions: four helpers, none of them authoritative

Junctions are where hand authoring dies, and they are where a geometry-first add-on has to earn its keep. The design rule is the same for all four helpers: every field stays editable, and a helper only pre-fills what the geometry can already tell you. Nothing is generated behind a curtain.

```mermaid caption=Two directions between curves and links, and they never fight
graph TD
    C[Curves in the viewport] -->|Auto Link| L[Links]
    C -->|Build Junction| J[Junction + connections + lane links]
    C -->|Auto Lane Links| LL[Lane links of a connecting road]
    L -->|Rebuild Connecting Roads| C2[Connector curves redrawn]
```

Auto Link Roads links every road end that sits within *link tolerance* (default 0.5 m) of another, predecessor for the start and successor for the end. An end touching a *connecting* road links to that road's junction rather than to the road itself, which is the rule readers expect and the one people get wrong by hand. All the ends go into a KD-tree, so a city-sized road network is one pass instead of the naive 4N² scan. Existing links are kept unless *Overwrite* is ticked in the redo panel.

Build Junction from Selection looks at the selected curves, and those whose both ends touch other selected curves become connecting roads of a new junction empty, while the rest are incoming. Links, connections and lane links are filled in. That definition is the whole trick: a manoeuvre through an intersection is exactly a road that is attached at both ends, so the selection itself tells you which curves are the junction and which are the streets.

Auto Lane Links writes one `<connection>` per road touching an end of the connecting road, and the lane pairs come from matching lane centres in world space while respecting travel direction. The direction rule under right-hand traffic is that lanes travelling `+s` are the right lanes. Traffic therefore leaves an incoming road on right lanes when it leaves at the road's end, and on left lanes when it leaves at the start. Entering the connector works the same way round: at its start it uses right lanes, at its end left lanes. Left-hand traffic swaps both halves of that. Get the table wrong and every turn in the map becomes a head-on collision, so it is worth writing down once instead of rediscovering it at each junction.

### Rebuild Connecting Roads: the junction helper I actually use

This is the reverse trip and the feature that made the add-on worth finishing. The links already say which lane of which street meets which lane of the connector. So each connecting road can be redrawn as one Bezier, lane centre to lane centre, tangent to both streets. Move a street, press the button, and every manoeuvre through the junction follows.

It reads connections and lane links and never writes them, because they are the input here rather than the output, and re-deriving them from ends that have just moved is precisely how you lose an afternoon of authoring. It does replace the curves, hand-tuned ones included, which is why it asks first.

The handle length is where a naive version looks wrong:

```python file=junction.py
cosine = max(-1.0, min(1.0, d0.x * d1.x + d0.y * d1.y))
turn = math.acos(cosine)
if turn < 1e-4:
    reach0 = reach1 = span / 3.0
else:
    arc = span * (4.0 / 3.0) * math.tan(0.25 * turn) / (2.0 * math.sin(0.5 * turn))
    reach0 = reach1 = arc
    meet = _tangent_meet(p0, d0, p1, d1)
    if meet is not None:
        # two thirds of the tangent length is the cubic that reproduces
        # the quadratic through the crossing — the natural cap per end
        reach0 = min(arc, 2.0 / 3.0 * meet[0])
        reach1 = min(arc, 2.0 / 3.0 * meet[1])
```

Three things in nine lines:

1. The base length is the exact cubic approximation of the circular arc that turns by the same angle. A turn then comes out shaped like a turn, and collinear ends produce handles on the chord, which the exporter writes as a `<line>`, so a straight-through manoeuvre stays straight all the way into the XML.
2. Each handle is capped at two thirds of its own tangent length. One length for both ends breaks on a skewed junction, where the far tangent is short, the handle overshoots it, and the curve swings out across the intersection. Capped, both handles stay inside the triangle formed by the two endpoints and their tangents' crossing, and by the convex hull property a cubic whose handles sit in that triangle stays in it. That triangle is exactly the room a manoeuvre is allowed.
3. The ends leave at the grade of the road they join. Without the slope terms the height runs linearly between the ends and the vertical profile kinks at both, which on a crest reads as a speed bump at the mouth of every turn.

Then there is the genuinely circular part. The connector's own lane offset is read at `s = length`, and rebuilding the curve changes that length. So the rebuild iterates: measure the candidate curve, feed the new length back, up to twelve passes. Constant widths settle on the first pass; a width or lane offset that varies along `s` takes one or two more. Nothing is written until it converges, so a road that fails on a later pass is left untouched rather than half-rebuilt.

The convergence test is a distance, not an iteration count. A residual under a tenth of a millimetre is finer than any lane width anyone authors, so a road is only reported as failed when its end is still *moving*. That means a width or offset along the road moves the end faster than the end itself moves, which is an authoring contradiction rather than a numerical one.

Roads it cannot read are reported by name with a reason and left alone: nothing linked at an end, no lane to follow, an end landing on another connecting road, an `elementS` past the end of the road it taps, a length that never settles.

:::info
Junction types: `default`, `virtual` (main road plus its `sStart`/`sEnd` span and orientation, for a side road tapping a through road partway along), and `crossing` (overlapping `<roadSection>` s-ranges plus which road has priority, and no connecting roads at all). Direct junctions are not offered: their `<connection>` has no connecting road, it carries `linkedRoad`, which a model where the connection lives on the connecting road cannot express.
:::

## Flip Direction: reversing s without corrupting the road

Curve direction is `s`, so reversing a curve is not a geometry edit at all. It is a coordinate change, and it invalidates every number in the sidebar that is keyed to `s`. Get it wrong and the road is corrupted quietly. What Flip Direction has to re-read from the new start:

- lane sections, whose spans `[s, next s)` become `[length - end, length - s)`,
- every `sOffset` entry inside them, with each width, lane offset and superelevation cubic **reversed over its own span**, not merely re-keyed,
- right and left lane lists, which swap sides,
- predecessor and successor, which trade places whole, including `elementDir`, since that is the target's direction relative to *this* road,
- lane predecessor/successor ids, which name lanes of the neighbour road, and that neighbour is not flipping, unless it happens to be this road itself, which has to be read before the two links trade places,
- `elementS`/`elementDir` taps and virtual junctions sitting on this road,
- links from other roads pointing at this one, whose contact points are now the other end.

That list is why the button exists. Every item is something a person doing it by hand forgets, and the failure mode is a file that validates, loads, renders, and sends traffic backwards down one lane of one road.

## Validating the .xodr export: the ASAM schema is the easy half

`Validate` runs a semantic pass first, and it collects everything at once rather than stopping at the first problem, so one click lists the whole job:

| Check | What it catches |
| ----- | --------------- |
| ids present and unique | two roads exported as the same `id` |
| link targets of the right kind | a link pointing at an empty that is not a junction (a road may legally be its own neighbour, which is a loop) |
| no NURBS spline | a curve whose control polygon is not the curve |
| first lane section at `s = 0`, sections increasing | the section model's hard requirement |
| widths defined from `sOffset` 0, cubics non-negative | a lane that inverts partway along |
| lane predecessor/successor ids readable and existing | the classic dead lane link |
| connections' incoming roads actually reach the junction | by a link, or in a virtual junction by the connector's `elementS` |
| lane-link ids exist on both sides | a turn into a lane that is not there |
| signals and objects sit on a road | an orphan sign |
| controllers drive at least one signal | the schema demands one `<control>`; every control must point at a signal in this scene |
| signal validity zones stay on the road | a sign ruling over stretch past the end of the street |

The non-negative width check is the one with actual maths in it. A cubic's minimum over `[0, span]` is at an end or at a stationary point inside, so the check solves `b + 2c·x + 3d·x² = 0` and evaluates the candidates in range, rather than sampling and hoping the dip falls on a sample.

After that comes the real schema, which is optional. Point *XSD folder* at the ASAM schema folder, the one holding `OpenDRIVE_Core.xsd`, and every export is checked against the standard as published, `xs:assert` rules and conditional junction types included.

:::danger{title="XSD 1.1 is why the add-on ships wheels"}
The ASAM schema is XSD 1.1. `xmllint` cannot read it at all, so the check runs on Python's `xmlschema` module. Blender's own `site-packages` lives inside the signed app bundle and is not writable by `pip`, so the module and its dependency are bundled as wheels and declared in `blender_manifest.toml`: installing the add-on as an extension installs them. Run from a plain `scripts/addons` folder instead and the add-on unpacks the same wheels to a temp folder itself, because that is the path the tests take, and nobody reliably runs a test that needs a manual `pip` step first.
:::

Export refuses on errors and proceeds on warnings.

## The .xodr writer: numbers that read back as what you typed

`build_tree()` assembles the document in the order the 1.9 schema prescribes (header, roads, junctions, and inside a road `link`, `type`, `planView`, `elevationProfile`, `lateralProfile`, `lanes`, `objects`, `signals`), and it decides nothing on its own. Every value comes from the object's properties or from the reference line, and the validator has already refused whatever the schema would reject.

The one piece of real thought in the exporter is number formatting, which sounds like a detail until you diff two exports of the same scene:

```python file=export.py
def _num(value):
    """A float as OpenDRIVE readers want it: shortest round-trip decimal,
    never exponent notation, integers without a trailing '.0'."""
    value = float(value)
    if value == 0.0:
        return "0"
    # Blender properties are single precision: a 0.02 typed in the panel is
    # 0.019999999552965164 as a double. If the value IS a float32, print the
    # shortest decimal that reads back to that float32 — what was typed.
    single = numpy.float32(value)
    # Doubles come from the arc-length quadrature: 30.000000000000007 is a
    # 30 m road, so they are rounded to a picometre before printing.
    text = str(single) if float(single) == value else repr(round(value, 12))
    if "e" in text or "E" in text:
        text = format(value, ".20f").rstrip("0").rstrip(".")
    if text.endswith(".0"):
        text = text[:-2]
    return text or "0"
```

Blender properties are single precision, so a road mark width of `0.02` typed into the panel arrives as `0.019999999552965164` in double. Print that and the file becomes unreadable for humans while the diff fills with noise, whereas printing `0.02` round-trips to the same float32. Lengths come from the quadrature as honest doubles, where `30.000000000000007` is a 30 m road. Exponent notation never appears at all, because a surprising number of `.xodr` parsers in the wild choke on `1e-05`.

The output of all that, for a road that runs 30 m straight and then turns 90° left with a 30 m radius, is the kind of `planView` that survives a round trip through a text editor:

```xml file=network.xodr
<planView>
  <geometry s="0" x="0" y="0" hdg="0" length="30">
    <line/>
  </geometry>
  <geometry s="30" x="30" y="0" hdg="0" length="47.130500941961">
    <paramPoly3 aU="0" bU="49.705627484771" cU="-9.411254969543"
                dU="-10.294372515229" aV="0" bV="0" cV="40.294372515229"
                dV="-10.294372515229" pRange="normalized"/>
  </geometry>
</planView>
```

## What the Blender OpenDRIVE add-on covers, and what it does not

| Covered | Notes |
| ------- | ----- |
| Roads, reference line, elevation | exact `paramPoly3` / `line`, elevation from control point Z |
| Lateral profile | superelevation cubics along `s` |
| Road types and speeds | multiple entries along `s` |
| Lane sections and lanes | ids from list order, type, level, speed, access, direction |
| Lane widths and road marks | cubics from `sOffset`, marks with type, weight, colour, material, width, lane change, height |
| Lane offsets | the centre line's own cubic offset from the reference line |
| Links | road or junction targets with contact point, or `elementS`/`elementDir` partway along |
| Lane links | comma-separated id lists, so merges and splits are expressible |
| Junctions | default, virtual, crossing; connections and lane links |
| Signals | full 1.9 attribute set, `<validity>` lane spans, `<semantics>` supplementary distance |
| Objects | full attribute set plus `<parkingSpace>` details |
| Controllers | `<control>` lists, sequence, optional junction reference, standalone export |
| Traffic rule | RHT / LHT, which the junction helpers respect |
| Validation | semantic pass plus XSD 1.1 against the published ASAM schema |

### Exluded

| Not covered | Why |
| ----------- | --- |
| Import | the add-on writes `.xodr`; reading one back is a different project |
| Direct junctions | their `<connection>` has no connecting road to own it |
| Railroad, junction groups, stations | out of scope for road networks |
| Lane `border`, `material`, `height` | not needed yet, and every one of them is a new panel |
| Object outlines and markings | same |

One headless test file registers the add-on from its own folder, builds roads, a junction, a signal, an object and a controller, exports the `.xodr`, and asserts on the XML: that each `paramPoly3` evaluates back to the Bezier it came from, that lane ids, links, connections and `s`/`t` are right, that element order matches the schema, and that the junction carries its `<controller>` reference. When the ASAM schema folder is present it validates the output against it too.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python opendrive/tests/test_opendrive.py
```

Running it takes seconds, and it is the reason the refactors above were possible at all. When the only way to test an add-on is clicking through its sidebar, you stop changing it.

## FAQ

<details><summary>Why not use the existing Blender OpenDRIVE add-on?</summary>
The <a href="https://github.com/johschmitz/blender-driving-scenario-creator">Blender Driving Scenario Creator</a> is a good tool with a different premise: you place road pieces with its own operators and it generates both the <code>.xodr</code> and the meshes. I wanted the opposite direction, where arbitrary curves I had already drawn, or imported, become roads exactly as drawn, and the meshes stay entirely my problem. If you want a guided road builder with mesh output, use that one.
</details>

<details><summary>Is a cubic Bezier really an exact paramPoly3?</summary>
Yes, and this is the whole design. Both are cubic polynomials in one parameter, so the conversion is a change of basis with no error term. What is <em>not</em> exact is arc length, because the parameter of a cubic is not distance along it, which is why the add-on carries a quadrature and a Newton solver. The geometry stays exact and the parameterisation gets inverted numerically.
</details>

<details><summary>Do consumers like CARLA care that there are no spirals?</summary>
For loading it, no: <code>paramPoly3</code> is standard geometry and every reader handles it. It matters for curvature continuity: a cubic's curvature is continuous within a segment but not necessarily across control points, so a vehicle model that reacts to curvature directly can feel a step where a clothoid chain would have been smooth. Keep handles collinear at control points and that goes away, which is the same G1/G2 discipline as any spline work.
</details>

<details><summary>How do I get lanes onto a road I imported as a curve?</summary>
Set its kind to Road, add a lane section at <code>s = 0</code>, add lanes to the right and left lists, and the overlay shows the result immediately. For a network, select everything and press Auto Link Roads, then select an intersection's worth of curves and press Build Junction from Selection. The helpers pre-fill; you fix what they guessed wrong.
</details>

<details><summary>What happens when I move a street after building the junction?</summary>
Press Rebuild Connecting Roads on the junction empty. It reads the authored lane links and redraws each connector's curve from the lane ends they name, tangent to both streets and leaving at their grade. It does not touch the links themselves, so nothing authored is lost, though it does overwrite hand-tuned connector curves, which is why it confirms first.
</details>

<details><summary>Where does the mesh come from?</summary>
The mesh does not come from here. The <code>.xodr</code> is the road's logic, exactly as in <a href="/blog/opendrive-map-creation">the format post</a>: lane centrelines for <a href="/blog/ai-traffic-simulation-idm-mobil">IDM traffic</a>, sidewalk lanes for <a href="/blog/unity-navmesh-ai-navigation">NavMesh pedestrians</a>, junction topology for routing. The visible road stays whatever you modelled in Blender, in the same file and on the same curves, which is the actual convenience of authoring the network there in the first place.
</details>

## Conclusion

The thing I did not expect is how much of the add-on is not OpenDRIVE at all. The format part, meaning lanes, links, junctions, signals and the writer, is mostly patient transcription of a spec. The work was in the seams: inverting an arc length that has no closed form, deciding that a straight-in-plan road still owes you its vertical curve, capping a fillet handle so a skewed turn stays inside its own junction. The list went on with a connector whose length depends on the lanes whose position depends on its length, and with re-keying twenty kinds of `s`-indexed data whenever a curve gets reversed.

All of that is the price of one decision: refuse to approximate the curve. Fitting arcs and spirals would have deleted the quadrature, the Newton solve and the convergence loop, and given me back a road that is nearly the one I drew. For a map that traffic logic reads back lane by lane, "nearly" was the part I did not want to debug at 2 a.m. six months later, and the exported `planView` being the curve on the screen has held up better than any other choice in the project.

This Blender OpenDRIVE add-on lives in my own pipeline rather than on an extensions platform, and it does exactly what one person needed, which is the correct size for a tool like this. If you already live in Blender and your simulator speaks `.xodr`, the shape of the idea transfers even if the code does not. The curve editor you use every day can carry a road network, and the format has a primitive that fits its curves exactly.
