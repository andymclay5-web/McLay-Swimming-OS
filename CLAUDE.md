# McLay Swimming OS — Technical Handover to Claude

**Handover date:** 3 September 2026
**Repository:** `andymclay5-web/McLay-Swimming-OS`
**Source:** Written by ChatGPT (prior lead AI on this project) at Andy's request, to transfer full context to Claude for ongoing development. Reproduced here as delivered, for persistence across sessions. Read this file in full before making any product or architecture decision on MSOS.

---

## Current repository anchor at handover

The latest `main` commit verified at handover time:

`ad793e39e2beb776235185bd88ce7f1b86f753be`

Commit message: `Merge PR #126: restore @100p swimmer target times`

The last merged PR was:

- PR #126 — `repair/race-pace-shorthand-targets-20260901`
- Title: `Restore swimmer target times for @100p deck shorthand`
- Purpose: promote shorthand such as `50 #1 @100p @1:30` into race-target intent so the existing Coordinator/RacePace path returns swimmer-specific target times rather than only the authored send-off.

PR #126's head passed the major targeted architecture/training/runtime suites, but Final Product Acceptance still failed. The exact first failing test was:

`tests/meet-sisc-swimmer-persist-20260828.cjs`

Failure: `page.waitForSelector: Timeout 3000ms exceeded` waiting for `.ba-intel`

Because Final Product Acceptance is sequential, later device/journey checks were skipped after that failure. **Therefore there is no basis for saying the current application has passed full product acceptance or full phone acceptance.**

Andy's own field assessment is stronger and should govern release language: **he cannot recall ever having a version of MSOS on his phone that he accepted as a genuine full pass.** Do not tell him otherwise unless a new build completes the full real-device journey successfully.

The repository contains `architecture/AUTHORITY_MAP.md`. Its central rule is: **one domain, one policy owner, many projections.** It explicitly says a later-loaded file must not become policy merely because it executes later, identifies current authoritative owners, and records that architectural consolidation remains incomplete.

A historical static-export audit caused confusion because its snapshot differed from later/current `main`. **Treat the live repository, current `index.html` load graph, current service worker, and current runtime bytes as authority, not old handover claims or conversation memory.** In particular, current PR #126 runtime logs show `engines/live-training-authority.js` being requested and show a substantial stack of loaded Meet modules. An older static export apparently did not. Never reconcile discrepancies by guessing: inspect current `main`.

---

## 1. McLay Swimming OS — Product North Star & Product Constitution

### Provenance

The text below is a reproduction of the substantive North Star document ChatGPT produced for Andy on 1 September 2026, with transient citation markup removed. It was not an independently committed source document at the time it was written — it was constructed from accumulated MSOS discussions, product decisions, architecture documents, acceptance specifications, and poolside field experience. Therefore: the wording is verbatim from that 1 September document; the underlying product content is partly a reconstruction/consolidation of earlier discussions; it should be treated as the most complete conversation-level North Star; where current committed product contracts differ, surface the discrepancy rather than silently choosing one.

### McLay Swimming OS — Product North Star & Product Constitution — Master vision, 1 September 2026

#### 1. What MSOS is

McLay Swimming OS is a coaching operating system. It is not primarily a workout-writing app, stopwatch, attendance system, database, results viewer, AI assistant or reporting package.

It connects the entire coaching process: programme → planning → session → delivery → individualisation → observation → testing → racing → review → learning → next coaching decision.

There must ultimately be one canonical chain of truth: programme → session intake → canonical workout → Board → individual prescription → coaching evidence → delivered truth → training/performance analysis → swimmer/squad/team reporting → next plan.

The defining idea remains: **one session, many coaches, every swimmer seen.**

The expanded version: one baseline squad session, many purposeful individual programmes. Purpose-driven, evidence-based learning, coach control. Swimmers see clarity; the system holds complexity.

The system should make sophisticated coaching easier to deliver, not make coaching more complicated.

#### 2. The six North Star tests

Every MSOS decision should be judged against six words: **Fast. Stable. Reliable. Adaptable. Always learning. Individual within the team.**

**Fast** — On deck, the coach cannot wait for software. Open it and coach. Tap something and it responds. Capture something and it is safe immediately. Information the coach predictably needs should be one tap away.

**Stable** — The interface must not move underneath the coach. Changing view must not change session. Taking Roll must not alter the workout. Backgrounding the phone must not lose context. Sync must not repaint the Board. Opening one feature must not disturb another.

**Reliable** — If MSOS displays a time, distance, PB, qualifying standard, modification, attendance record or completed-session fact, the coach must be able to trust it. Unknown is preferable to invented. A feature that works 95% of the time but occasionally destroys coaching truth is not ready.

**Adaptable** — The squad shares a coaching purpose, but swimmers do not necessarily need identical work. MSOS needs to adapt volume, rest, pace, stroke, technical requirements and other prescription elements while retaining the purpose of the session.

**Always learning** — MSOS should become more useful because coaching happened. Today's observations influence tomorrow. Delivered training affects the understanding of exposure. Tests affect targets. Races affect pathway understanding. Technical observations remain connected to the athlete. The season gradually becomes an evidence-rich coaching history rather than a pile of disconnected sessions.

**Individual within the team** — This may be the most important philosophical distinction. The goal isn't to turn squad swimming into 20 unrelated individual programmes. It is: one coaching purpose, individually appropriate execution. The swimmer should increasingly feel: *this programme understands me* — while the coach is still coaching a team.

#### 3. Coach authority

The coach remains the author and decision-maker. MSOS is not an AI workout generator by default. The coach writes the baseline squad programme and determines its purpose.

The system can: calculate; organise; retrieve; connect evidence; identify patterns; calculate targets; propose modifications; expose exceptions; surface useful questions; reduce administration.

But it must not silently decide what the coach meant. AI should reduce cognitive load, not assume coaching authority.

The coach can deliberately create specialist streams — sprinter, distance, breaststroke, IM, para/adapted, etc. — while still maintaining the shared squad purpose. Future automated individualisation is possible, but only where the coach deliberately permits it.

#### 4. The app should disappear while coaching

A successful poolside product is almost invisible. The coach should be looking at swimmers, not operating software. The phone is a tool in the coach's hand, not the centre of the coaching interaction.

The poolside workflow should be extremely shallow: open → current session → coach, with quick access to: **Board · Roll · Times · Capture**. Anything else is secondary.

The Board should feel like a very good whiteboard, not a database dashboard. It should show: the work; the useful coaching cue; the send-off/rest; a real target where applicable; individual differences beside the same work.

It should not show: internal engine language; debugging information; excessive planning metadata; fake targets; duplicated controls; unnecessary navigation; software complexity.

#### 5. One canonical session

This is one of the strongest architectural requirements because failures here have repeatedly damaged the product.

There is one session. Not: source session; parsed session; Board session; modified session; cloud session; cached session; TV session; swimmer session; historical session; hydrated session. Those can be representations or records of the same thing. **They cannot become competing authorities.**

The canonical workout must understand coaching language structurally: blocks; items; repeats; rounds; compositions; stroke; zone/stimulus; rest; send-off; equipment; technical cues; race intent; distances.

Natural coaching shorthand should remain natural. MSOS must understand the coach rather than forcing the coach to write software-friendly sessions. The canonical workout then feeds every downstream product.

#### 6. Live editing becomes truth immediately

Poolside coaching changes. That is normal. If the coach changes `8 × 100` to `6 × 100`, that becomes the canonical delivered prescription immediately.

One edit should update: Board; total distance; block distance; individual modifications; target calculations; send-offs; timing; TV Board; swimmer device; session analysis.

Old generated outputs from the previous prescription must be invalidated. Local save first. Cloud second. No navigation away. No waiting for sync. No hidden second version of the workout. And historical truth must retain what was actually delivered without double-counting the edit.

#### 7. Roll is part of the session, but cannot control the session

Attendance is bound to the selected session. It must persist. Changing views must not clear it. Backgrounding must not clear it. Hydration must not clear it. Meet must not affect it. Taking Roll must never cause the workout to reparse or mutate.

Attendance can influence: individual prescription; lane organisation; timing; TV display; reports; training exposure. It cannot influence canonical workout identity. Cross-squad swimmers must also be possible when genuinely attending.

#### 8. Individualisation

This is not simply "Charlotte does 50%" or "McKenzie does 67%." Those ratios can be useful starting points, but they are not the coaching model.

Individual prescription should preserve: session purpose; physiological stimulus; practical recovery; technical objective; pool geometry; lane flow; athlete capacity; classification/physical constraints where relevant; evidence-based pace.

The system must generate swimmable coaching prescriptions, not mathematically neat ones. No ridiculous partial lengths just because a percentage produced them. Where possible: 50 / 100 / 150 / 200 and sensible patterns that return swimmers to the right end of the pool.

Existing athlete-specific constraints remain athlete-specific rather than being replaced by generic reduction logic. The modified swimmer should still understand the connection: "that's what the squad is doing → this is my version."

#### 9. Physiology and training model

The physiological foundation should reflect the coaching model, not generic fitness-app terminology. A major foundation is Clive Rushton's Swimformation/Cone framework, alongside the coaching methodology developed from it.

That informs interpretation of: aerobic capacity; aerobic power; anaerobic capacity; anaerobic power; overload; threshold; clearance/recovery; race-specific work; training dose.

The goal isn't merely to count metres tagged with labels. After a session MSOS should understand approximately what training was delivered, including: raw volume; stroke exposure; stimulus/energy-system exposure; individual dose; squad dose; team dose; rolling exposure; planned versus delivered.

Any dosage weighting model must remain explicit, auditable and provisional rather than pretending to be laboratory physiology.

#### 10. Session planning must connect the season

Sessions should never exist in isolation. Planning needs the hierarchy: season → phase → month → week → session → block → swimmer.

Before writing today's session, MSOS should be able to surface concise relevant context: current season phase; physiological emphasis; technical emphasis; weekly objective; carry-forward from the previous week; previous same-squad session; athlete issues worth remembering; next competition; pool/course/venue; expected swimmers.

But once the session is written, most of that planning machinery should get out of the way. The live Board should remain simple.

#### 11. Weekly flow matters

A week isn't seven independent workouts. MSOS should increasingly understand the relationship between sessions. The coaching progression identified is: body position → power transfer → race rhythm, and more broadly: skill → application → pressure → performance.

Weekly review should capture: what actually happened; whether the intended physiological distribution occurred; technical themes; athlete response; disrupted/missed work; what should carry forward; what needs progression next week. This is the beginning of the learning loop.

#### 12. Targets must have evidence

Target times should appear where useful. Not everywhere. Possible authoritative sources include: current T400 evidence; validated race-pace model; PB; qualifying standard; pathway target; coach-entered target; validated physiological model.

The Board should show both the number and enough context to understand it, e.g. `1:07 · T400` or `31.2 · 100 RP`. If there is no defensible target: `Coach target required` is better than inventing one.

#### 13. T400

T400 is evidence. It is not itself a training zone or session purpose. A valid current T400 can calibrate aerobic work. A newly captured real T400 should immediately become usable evidence. Course and stroke matter — a named-stroke request must not silently substitute Freestyle. A modelled number must never overwrite an actual test.

#### 14. Race pace

Race-pace work needs to understand: target event; target time; repeat distance; expected split; appropriate recovery/work:rest relationship. For a swimmer doing a modified distance, MSOS must preserve the stimulus relationship, not blindly preserve the squad send-off. That is why target time and recovery need to be treated together.

#### 15. Timing

Timing needs to become a genuinely useful deck tool: multiple swimmers/channels; interval starts; wave starts such as +5/+10; splits; cumulative and subtractive splits; final time; stroke rate; connection to the exact set and athlete. But the interaction must be simpler than operating a complicated stopwatch application. Manual result entry must remain easy. Timing is evidence — once saved it belongs to swimmer + session + set + date + context.

#### 16. Capture and coaching evidence

Capture should be one of MSOS's strongest features. From the Board: Note · Voice · Photo · Video, then: who? → capture → save. The current session and block are already known. The coach should not have to fill in a form explaining context the system already knows.

Swimmer tagging needs to support one swimmer, several swimmers, or the whole group. Save should visibly confirm, e.g. `Saved → Charlotte · Main Set · 6×50 Fly`, and return the coach to exactly where they were. Text, voice, photo and video save locally first, with cloud replication afterwards.

#### 17. Evidence becomes athlete memory

A technical observation shouldn't disappear into a notes archive. Over time the athlete profile should build a useful evidence history: recurring technical observations; successful cues; training responses; test results; race patterns; videos; coach observations; progression; recurring problems. The point isn't to collect data for the sake of data — it is to make tomorrow's coaching decision better.

#### 18. The swimmer intelligence layer

MSOS should answer predictable coaching questions immediately: what's their PB; what's the qualifying time; how far away are they; which event are they closest to/furthest from; what's their next points milestone; what splits correspond to the target; what's their current technical focus; what have we been seeing recently; how much relevant training have they actually done; why might they be struggling with this.

The first group is deterministic and should be instant. The last question requires interpretation. MSOS may say something such as: "Recent aerobic-power exposure is low: one completed AP session in the last three weeks. That may be contributing." It cannot say: "You're struggling because you missed aerobic-power training" unless the evidence actually establishes causation. That distinction is fundamental.

#### 19. Performance and pathway

Performance data should connect training to where the swimmer is going. For every event, where data exists: PB; course; date; progression; qualifying standard; gap; next milestone; points; target time; race-pace requirements; split requirements; relevant observations.

For para swimmers, this must correctly understand: S; SB; SM; classification-specific events; multi-class competition; WPS/points logic where relevant. Official performance truth always outranks modelling.

#### 20. Swimmer-facing product

There are two different swimmer-facing products.

**Whole-group / TV Board** — a deck display for the squad. Common work stays grouped. Do not create ten identical swimmer cards. When prescriptions genuinely diverge, individual cards appear showing: swimmer; work; target; send-off; relevant cue; useful context.

**Individual Device** — a swimmer's phone/tablet should answer "what exactly am I doing right now?" Current work first, then where appropriate: modification; target; splits; cue; HR context; equipment; next work; pathway; PB; meet information; deliberately shared coach evidence.

The two surfaces derive from the same canonical coach session.

#### 21. Matthew — remote swimmer reference case

Matthew is not a special one-off product. He is the reference case for what remote swimmer delivery needs to become. His authenticated product should contain: his training; his individual prescription; his performance; his pathway; relevant meet information; deliberately shared coaching evidence; feedback/reflection capability.

It should not expose: other swimmers; private coach notes; owner/admin controls; internal programme information not intended for him.

Top information should be immediately visible, with deeper event/pathway detail available by tapping. Access must be genuinely secure: authenticated; revocable; scoped server-side; sensible token/session expiry; not a permanent code he can simply give to somebody else.

#### 22. Assistant coaches — Jordan reference case

Jordan represents a different product. He is an assistant coach, not a swimmer. His interface should essentially give him the coaching tools required for the squad/session he is responsible for: Board; Roll; Times; Capture; relevant Meet functions.

Access should be deny-by-default and assignment-based. He should not automatically receive: owner settings; programme administration; unrelated squads; unrelated swimmer information; cloud repair/admin tools; private owner notes.

The Head Coach retains canonical programme authority. Actions should remain attributable so later review can establish what happened.

#### 23. Parent product — future direction

There is also a strong future case for a parent portal. Parents frequently want to understand: programme direction; competition planning; progress; what their child should be doing; how they can help; why particular decisions are being made. Coaches often spend considerable time repeatedly answering those questions.

A parent surface could provide deliberately published information that improves understanding and buy-in without exposing internal coaching material or other athletes. It must be a controlled information surface, not unrestricted access to MSOS.

#### 24. Coach Hub

Coach Hub is not a technical dashboard. It should answer coaching questions: What is the purpose today? What was planned? What was actually delivered? What changed? What did I observe? How is the week tracking? Who needs attention? What evidence supports that? What should influence the next plan?

The fundamental relationship is: season → week → today → delivered work → athlete evidence → next coaching decision. The system should increasingly surface exceptions, rather than forcing the Head Coach to manually inspect every swimmer.

#### 25. Finish is crucial

Finish is the bridge between what we planned and what actually happened. The coach must be able to "Finish session" or "Finish here" at an exact block/item boundary.

If only 4,300m of a planned 5,000m session was delivered, historical truth is: planned 5,000, delivered 4,300. The remaining 700m remains part of the original plan. It must not disappear, and it must not later masquerade as delivered training.

Finish should pre-fill what MSOS already knows: attendance; modifications; timing; edits; captures; delivered work. A quick review might then be Yes/Mostly/Not yet plus concise carry-forward. Finish must never destroy or replace the session it is reviewing.

#### 26. Planned versus delivered

Over time this becomes extremely valuable. MSOS should know what we intended to train versus what the athlete actually received. That allows useful review across session, week, 28 days, training phase, season — and across individual, squad, whole programme. This is much more valuable than simply counting kilometres.

#### 27. Reports

Reports should translate data into coaching information, not database output. Levels: Athlete, Squad, Team, across useful periods. They should connect: attendance; delivered volume; stroke exposure; physiological/stimulus exposure; modifications; testing; PB/performance; pathway; race evidence; coach observations; changes over time.

The weekly coaching report should preserve: weekly flow; season alignment; session themes; actual completed work; coaching cues; athlete response; next-week progression. That gives the programme a memory.

#### 28. Meet — future role

Meet is still part of the overall OS, but the recent South Island experience changed how it should be approached. It should be much simpler than the version built so far.

At a meet the coach primarily needs: programme; swimmer; next race; heat/lane; race plan; goal; capture; result; splits; technical observation; post-race report; next-round context.

The field experience showed that manually entering lots of splits while coaching is cumbersome and that conversational voice transcription is not reliable enough as the main live interface. The better long-term direction is: silent capture → stop → process → structured race report, rather than an assistant talking to the coach during a race.

The key lesson from the meet work is: **the report is the product.** The transcript/audio is evidence. The coach wants the useful structured race information afterwards. Meet truth remains completely separate from training-session truth.

#### 29. Offline first

Poolside operation cannot depend on the internet. The phone must operate independently. Desktop may become the deeper home base / hard dock for planning, history, analysis, reports, administration — but the desktop must not need to be running for the phone to work. Both can hold local operational state.

Cloud is replication and synchronisation, not availability truth. Cache enough locally to coach: current/upcoming sessions; roster; relevant athlete evidence; PB/pathway information; T400/race-pace data; notes; essential Meet information. Captures save locally and queue for cloud replication.

#### 30. Android / phone resilience

A phone call should not destroy coaching. Nor should: switching apps; locking the screen; opening the camera; opening another MSOS view; returning after several minutes.

The app must preserve: selected session; view; Board position; scroll; selected swimmer; expanded detail; unsaved Finish state; live edits. Then restore local operational state first. Background sync comes later. This has already been identified as a release-level requirement rather than cosmetic polish.

#### 31. Security and privacy

As MSOS expands beyond the Head Coach, privacy becomes architectural rather than cosmetic. Access must be enforced at the data layer, not simply by hiding buttons.

- **Owner** — full authority.
- **Assistant coach** — assigned scope and permitted actions only.
- **Swimmer** — self-only.
- **Parent** — their child's deliberately published information only.
- **TV Board** — purpose-specific display projection.

No role should gain access simply because it knows a URL. No permanent shared password/code should become a security model. Swimmer access in particular requires secure invite, session and revocation rather than a permanent transferable code.

#### 32. AI's eventual role

The long-term value of AI in MSOS isn't "write me a 5,000m workout." It is the ability to understand the accumulated coaching context. For example: Why is this swimmer struggling with aerobic power? What changed in Charlotte's fly over the last six weeks? Which swimmers are underexposed to race-pace work? What did we keep carrying forward but never actually address? How did this block compare with the previous one? What should I be watching tonight? Who is approaching a qualifying standard? Show me evidence behind that conclusion.

The AI layer should sit over structured canonical evidence. That is how it can become useful without hallucinating coaching truth.

#### 33. The system should learn the coach

MSOS should gradually understand the Head Coach's methodology — not by secretly rewriting it, but by learning patterns such as: preferred session structures; typical progressions; recovery expectations; individual adaptation patterns; recurring cues; what the coach changes on deck; which recommendations are accepted/rejected; how training phases progress; what actually works for particular athletes.

This potentially allows the system to become increasingly personalised to the coaching programme. But the coach remains able to see why something has been suggested.

#### 34. Swimmer reflection

Eventually the learning loop shouldn't be entirely coach-generated. A swimmer can contribute useful structured reflection: RPE; how something felt; confidence; technical sensation; race reflection; soreness/readiness where appropriate; what cue worked. This connects directly with the coaching approach of asking "what are you feeling on that breakout?" rather than only issuing instructions. It creates athlete ownership.

#### 35. One system, multiple surfaces

MSOS should ultimately have one underlying product and multiple appropriate projections: Head Coach; Assistant Coach; Poolside Board; TV Board; Swimmer; Remote swimmer; Parent; Meet; Desktop planning/review. These are not eight independent apps. They are eight views of appropriate parts of the same coaching truth.

#### 36. Architecture constitution

These are no longer implementation preferences. They are product rules:

1. One authoritative owner for each domain.
2. No patch chains.
3. No monkey patches.
4. No late wrappers over active authorities.
5. No competing sources of truth.
6. No UI hiding of broken underlying state.
7. No suppressing errors instead of repairing causes.
8. No weakening tests to obtain green CI.
9. Never clear operational user data as a repair strategy.
10. Local availability must not depend on cloud.
11. Background processes cannot change active coaching context.
12. Save locally first.
13. Real evidence always outranks modelled evidence.
14. Unknown remains unknown.
15. Fix the owner, then test every consumer.
16. No production change is accepted because CI passes alone.

#### 37. Real-device acceptance is mandatory

A release isn't proven because code compiles, unit tests pass, Guardian passes, a browser harness passes, or an agent says it is fixed. The final acceptance surface is the actual coaching device.

A proper release needs a protected live journey such as: Open → Board → Roll → individual modification → target → Times → Capture → background → resume → Finish → reopen history. At every stage: same session; same attendance; same canonical workout; same modifications; saved evidence remains; no unexplained navigation; no frozen interface.

Any freeze, wrong session, lost local edit, parser mutation or forced Board rebuild is a release failure, not a minor defect.

#### 38. Development philosophy

Keep what is good. Repair what is wrong. Connect what is fragmented. Add nothing that makes coaching harder. And: do it once, do it right.

Workflow: understand → reproduce → identify owner → repair → regression test → system test → real-device acceptance → release. Not: symptom → tweak → deploy → Andy discovers next regression. That development behaviour has to change regardless of who implements it next.

#### 39. What success actually looks like

The final vision isn't a screen full of features. It's a normal coaching day. You arrive at the pool. MSOS already knows where you are in the season, what this week is trying to achieve, what happened yesterday, who's expected, what matters today.

You open the session. The Board is immediately there. Roll takes seconds. The whole squad sees the common programme. Individual swimmers automatically get the right work where they differ. Targets appear where evidence supports them. You coach. You see something — one tap records it. You time something — the result is attached to the athlete and set. You change the session — every relevant surface changes with it.

A swimmer asks "what's my target?" — you tap once. A swimmer asks "how close am I to Nationals?" — you tap once. You finish early — MSOS records what actually happened. Afterwards, the system knows what was delivered. At the end of the week it tells you useful things you might otherwise have had to manually work out. Before the next session, those observations come back when they matter.

The swimmer sees a programme that feels individual. The assistant coach sees exactly what they need. The parent eventually sees enough to understand and support the pathway. And you spend less time operating software and more time coaching. That is MSOS.

#### 40. The ultimate North Star

If compressed into one statement: McLay Swimming OS is a coach-led, offline-first operating system that turns one purposeful team programme into the right work for every swimmer, captures what actually happens, connects training with technique, testing, racing and pathway evidence, and continuously returns that evidence to the coach as better information for the next decision — while remaining fast enough, stable enough and simple enough to disappear on pool deck.

And beneath it: One session. Many coaches. Every swimmer seen. Individual within the team. Coach controls the programme. Evidence informs the decision. The system holds the complexity so the people don't have to.

---

## 2. Decision history

Conversation-level decisions a new engineer should treat as settled unless current committed product documentation explicitly supersedes them. Some may since have been partly implemented or documented — that doesn't reopen the product question merely because the implementation is incomplete.

**2.1 Version 4 architecture was deliberately chosen to eliminate patch ownership.** Every domain has one engine responsible for its decisions; an engine may ask/provide data to another through a clear contract; an engine must not quietly perform another engine's role; UI/projection layers must not acquire policy merely because they're a convenient place for a fix; a bug must be repaired in the authoritative engine responsible for root cause; after a repair, architecture ownership must be rechecked. Andy repeatedly reinforced "no patches" and "every fix needs to be fixed in its own engine in the root cause." Do not interpret "no patches" as "never make a small change" — it means do not add a second authority to mask a defect in the first.

**2.2 Architecture consolidation is preferable to a rewrite.** The product does not need to be thrown away simply because the runtime is messy. There is a significant `architecture/` layer containing thoughtfully separated domain concepts. Current runtime logs load at least: `architecture/interaction-core.js`, `architecture/athlete-session-core.js`, `architecture/training-history-core.js`, `architecture/athlete-observation-core.js`, `architecture/athlete-report-core.js`. The likely structural problem is incomplete migration/cutover from the large `app.js`/legacy runtime into the intended engine/architecture design. Preferred strategy: identify authoritative ownership → finish cutover → remove superseded writers/wrappers → preserve proven domain logic → avoid "clean rewrite" unless evidence shows the canonical model itself is unsalvageable. `AUTHORITY_MAP.md` openly records transitional wrappers and consolidation targets — use it.

**2.3 `app.js` is not supposed to remain a permanent second operating system.** The intended destination is domain engines being actual owners, with `app.js` reduced to shell/composition/bootstrap concerns — not "app.js does everything + engines override selected pieces later." Where a later engine replaces an earlier function in `app.js`, that is transitional debt, not desired permanent architecture.

**2.4 Bridges are adapters, not policy engines.** A bridge routes requests/responses between engines. It must not choose physiology, add swimmer-specific policy, rewrite another engine's result, hydrate unrelated domain state, own caching rules that alter domain truth, overwrite PB/T400 identity logic, or become an alternate target engine. "The bridge can see both sides" is not justification for putting policy there.

**2.5 The Board is a projection of canonical truth, not a second session tree.** It displays canonical session structure, groups common work, shows differences, and requests targets/modifications from their owners. It must not independently decide canonical distance, swimmer modification policy, PB selection, T400 selection, race-pace calculation, or attendance truth.

**2.6 Board needs both whole-session and block-level views** — two projections of exactly the same canonical session, kept in sync with no duplicate independent state. Default on phone: compact whole-session outline with current block highlighted and fast jump-to-block.

**2.7 Large Main Sets must not become monolithic phone walls.** A live field failure made a huge Main Set nearly unnavigable (Capture/Finish hard to find, editing difficult during freezes, excessive scrolling, reduced situational awareness). Solution direction: subsection awareness, current-step awareness, compact outline, quickly reachable current-block actions — not just smaller text.

**2.8 Poolside controls must remain immediately reachable.** Capture, Note, Voice, Video and Finish need to be accessible quickly on phone. Do not put Finish at the bottom of a very long rendered set. Sticky/anchored poolside controls are settled.

**2.9 Session truth must be append-only/non-destructive historically** — critical after actual session loss. Creating/switching sessions must never overwrite a previously authored session. Historical sessions behave as immutable/versioned records. A live edit changes current canonical truth, but original plan remains preserved, change journal remains available, historical delivered truth remains reconstructable.

**2.10 Never "repair" a session by destroying original evidence.** Where saved canonical blocks, source text, and transcription disagree, authority order favours validated canonical saved structure over later reparsing/transcription guesses. Do not overwrite good structured data because a subsequent parser run produces a different interpretation.

**2.11 Session identity must be explicit and stable.** Date, AM/PM slot, squad, venue, course, session ID must not change from background hydration, history navigation, a stale picker, or a calendar default. There were field failures where Thursday work appeared as Wednesday PM or an old tiny session suddenly became active. Session identity changes require explicit user action.

**2.12 Previous-day session pins must not carry into a new day.** A manually selected/pinned historical session should not silently remain the active authoring target when the calendar day changes.

**2.13 Session writer/import must follow currently selected session** — not whichever session ID was captured when the UI originally opened, if the coach has explicitly selected another session.

**2.14 Navigation and browser history must not select a training session.** PR #125 addressed one known path. Browser/Android Back may restore view/detail layer/scroll context — it may not restore a different `selectedSessionId`. Settled architecture rule.

**2.15 Background hydration/sync must never take over the active coaching context** — one of the most important field-derived rules. Background work must not change: selected session; selected view; selected swimmer; squad filter; Board mode; current block; scroll position; expanded pathway/detail; unsaved notes; active Finish draft. Visible phone state belongs to the coach until an explicit navigation/action changes it.

**2.16 "Last safe view/session" recovery is desirable.** A freeze/crash/reload should restore the most recent safe session/Board state/scroll/current block/unsaved local evidence where practical — not a generic blank Complete Session screen.

**2.17 Local save precedes cloud work** for session edits, Roll, captures, timing, modifications, Finish, swimmer feedback. Immediate local confirmation required. Cloud unavailability must not block coaching.

**2.18 Cloud/Supabase is replication, not live availability authority.** The phone is expected to work poolside independently. Supabase syncs durable shared state, supports remote/role surfaces, backs up canonical data, supports cross-device access — but must not be required to open the Board, see current session, take Roll, save a note, time a set, or make a live modification.

**2.19 Do not clear site data as a repair mechanism.** Never resolve a bug by telling Andy to clear browser data, uninstall/reinstall, wipe IndexedDB, clear local storage, or sign out everywhere, unless there is a separately secured export and the destructive action is genuinely unavoidable and explicitly approved. Local browser state has contained important history not safely present elsewhere.

**2.20 Current operational state must outrank stale persisted hydration** (intended principle behind PR #123). A delayed database/local hydration may add missing archive data, but must not replace active current state or repaint the Board from stale state.

**2.21 Automatic startup repair is unacceptable for ambiguous session corruption.** A repair engine can expose diagnostics/explicit migration/explicit repair — it should not silently mutate current/historical canonical sessions on boot because some pattern resembles an old known bug.

**2.22 No date/session-specific production recovery code.** PR #122 briefly added a Sep-1-specific 3,800→4,300 repair; rejected as the wrong architectural answer; PR #123 removed it. Do not reintroduce logic like "if date is 2026-09-01 and total is 3,800, replace it with known source." Historical broken records can be explicitly repaired later if required; production behaviour must fix the underlying authority issue.

**2.23 Do not spend current effort "fixing" the old Sep 1 3,800m record.** Correct intended Sep 1 session: Whole 4,300m (Warm-up 1,200 / Pre 600 / Main 1,500 / Post 800 / Warm-down 200). Main was 5 rounds × (200 Overload + 100 Threshold) — important correction: 200+100, not 200+2×100. The broken persisted copy was 3,800m with a 1,000m Main. Andy said that session was finished (he didn't even perform the intended session because the app was broken) and does not want hidden recovery logic devoted to that historical record. Use as regression evidence, not a production patch target.

**2.24 Parent set distance counts once; internal instructional distances do not add phantom metres.** E.g. `6×50` with `25 drill / 25 swim` is 300m, not 600m. Child/internal distances can be stored for display/technique/semantics — not independent metres unless actually authored as independent work. Applies to 25/25 compositions, underwater segments, build segments, technical child instructions.

**2.25 Parent/child parser structure must be visually coherent.** If the parser treats e.g. a `400` as a parent whose breakdown is `300 Back / 200 Breast / 100 Fly`, those children must appear as visible subsidiary structure. If not visible, either the parse relationship is wrong or the projection is discarding the child relationship. Do not allow an invisible child tree to affect canonical distance/semantics while the Board suggests those lines don't exist. Active parser/Board investigation point.

**2.26 Natural coaching shorthand should be preserved, not normalised away** — e.g. `#1 Stroke`, `@100p`, `Second 100 of 200 Race`, `HR Gauge`, `Odd 200 Pace / Even Drill`, `3 Rounds`, `10s rest`. Unknown coaching language must remain intact rather than being deleted.

**2.27 `@100p`, `@200p` etc. are race-target intent.** `50 #1 @100p @1:30` means: delivered work = 50; target model = 100 race pace; cycle = 1:30. The event-target distance does not become 50 just because the repeat is 50. PR #126 was intended to fix exactly this.

**2.28 Race-target segment wording needs explicit semantics.** E.g. `100 #1 Stroke MAX — Target Second 100 of 200 Race` means target the second-100 race segment, not the whole 200 race time and not a generic PB division if a better race model exists.

**2.29 T400 is an evidence anchor, not a training zone.** Do not display T400 as though it's the purpose of the set — it supplies pace evidence for aerobic calculation.

**2.30 Latest valid dated T400 outranks older faster T400** (root of PR #117). Previously the selector could pick the fastest valid historical T400 — wrong when the task is to prescribe from current conditioning. Correct rule: newest dated valid real T400 first; for undated legacy rows where recency can't be established, use a conservative fallback such as previous fastest-valid behaviour; actual tests outrank modelled values.

**2.31 Course is part of evidence identity.** SCM and LCM are not interchangeable. A real SCM PB does not become an LCM PB because a conversion exists. Converted times may be used as models but should not overwrite authoritative PB truth.

**2.32 Named stroke evidence must not silently fall back to Freestyle.** Absent Breaststroke anchor (for example) should be represented as missing evidence, not silently replaced by Freestyle.

**2.33 Real data outranks models**, general hierarchy: (1) explicit coach-authored target/decision, (2) verified official result/test, (3) verified current athlete evidence, (4) validated model, (5) fallback heuristic, (6) unknown. A lower layer must never overwrite a higher layer.

**2.34 No fake target displays.** Never show `@00.00` or equivalent. Use `Target needed`, `No target loaded`, or appropriate non-pace instruction.

**2.35 Not every set should have a target.** Target boxes should appear for target-driven work, not clutter general technique, recovery, scull, drill, HR-gauge work.

**2.36** `2 × 200 IM — Clearance — 20s rest — HR Gauge` is HR-gauged, not pace-target-driven. Do not request T400 IM just because "Clearance" appears; display a clean HR instruction.

**2.37 Odd/even mixed race-pace sets need per-rep semantics.** E.g. `4 × 50 #1 Stroke @1:15 — Odd 200 Pace / Even Drill`: odd reps need race-pace targets, even reps remain drill work and should not show race-pace targets.

**2.38 Parent-level target presentation.** Target times should generally be grouped at the parent-set level in a compact table by swimmer rather than a separate large target box under every child line.

**2.39 Unique swimmer deck identifiers are required.** First names alone are insufficient (e.g. Matthew/Matt). Use compact unique initials, short disambiguating surname suffixes, or preferred/board names — never expose internal database IDs to solve this visually.

**2.40 `#1 Stroke` is athlete-specific.** The Board may resolve it differently per athlete from valid evidence or explicit coach override. A direct Board override for one line is line-scoped — it must not rewrite the swimmer's PB history, globally redefine their #1 event, or mutate unrelated sessions.

**2.41 Individualisation preserves stimulus, not percentages.** Generic volume ratios are fallbacks. The real question: how does this swimmer receive the intended stimulus and remain part of the same team environment? Factors: capacity; T400; race performance; squad reference; work:rest; pool geometry; technical constraints; safe/functional movement; session time; common starts where valid.

**2.42 Ratios such as 1/2 and 2/3 are load fallbacks, not speed models.** Do not derive a swimmer's pace by multiplying another swimmer's speed by their distance ratio — a 2/3-volume athlete may have independent pace evidence.

**2.43 Comparison should be against the assigned squad, not whoever happened to attend today.** A weak attendance sample must not redefine what "National squad stimulus" means. Future direction: a rolling Squad Stimulus Profile using current/recent T400, race/PB evidence, recurring set structures, sustainable load, technical demands — attendance can contribute evidence but is not the sole comparator (also recorded in `AUTHORITY_MAP.md` as a consolidation target).

**2.44 Common starts are desirable only when they preserve stimulus.** If the modified swimmer can stay on the squad cycle and still receive appropriate work/rest, keep common starts; if not, adjust distance/reps; if even that fails, give an individual cycle. Do not preserve "same send-off" merely for UI tidiness.

**2.45 Race-pace recovery rules are deliberate.** 200-pace work often needs ~30–40s recovery; 100-pace work generally needs ~1:2 work:rest; if a modified swimmer's target time is ~50–65s for 100-pace work, a 2:00 cycle is around the lower reasonable end; do not shorten a longer coach-authored cycle simply because the minimum formula says less recovery is sufficient — preserve the coach's longer recovery when safe.

**2.46 Aerobic work usually uses real rest, not tight cycle chasing.** Typical quality aerobic prescription: current T400/model-based target; ~10–30s real recovery depending on intended zone/set; reduce volume if session-time constraints require it. Target merely fitting under the send-off is not sufficient evidence the prescription is correct.

**2.47 Session duration must be calculated from actual set structure**, not a broad "5km ≈ 90 minutes" estimate. Include authored send-offs, expected swim time, explicit rest, recovery, equipment/transition, block transitions, normal coaching downtime (~7 minutes baseline in addition to explicit set mechanics for planning purposes).

**2.48 Tuesday 11 August race-pace ladder is a timing regression fixture** — see section 7 for the exact numbers; establishes that a 90-minute session is already close to full with the ladder + warm-up/pre-set/aerobic resets/back-end work; do not add another 600m finish based on a broad distance estimate.

**2.49 Actual delivered Tuesday session is the regression fixture, not only the clean draft** — real delivered session ended with 3 rounds of 200 Regeneration + 2×100 Development with 10s rest; Board presentation was broadly acceptable except modified/para swimmers lacked aerobic target times where needed, and targets appeared in places where not useful. Preserve working presentation behaviour while fixing target classification.

**2.50 Session planning workflow follows coaching progression:** aerobic warm-up → isolated skill/school-work block → main set that directly applies those cues → warm-down. Quality technique often uses simple recovery (+15–20s) rather than tight send-offs. Core technical cues: underwater/breakout; body and hip rotation; stable head position; deck cue "like you're wearing a neck brace." Swimmer-led feedback questions: "What are you feeling on that breakout?" / "How is your hip rotation holding up at the end of the pool?"

**2.51 Andy often talks through a session before wanting feedback.** Do not interrupt every partial idea — let him establish the session, provide evaluation when he asks for a take/input.

**2.52 Board should remain readable as a whiteboard**, not turn into an analytics dashboard. High-value information only; deep analysis belongs in athlete details, Coach Hub, reports, pathway, deeper controls.

**2.53 Meet and Training truth must be siloed.** Meet activity must never mutate training selected session, training Roll, training canonical session, or training modification state. Conversely, training sync must not overwrite an active Meet workflow.

**2.54 No Meet interface should leak into Training.** Andy explicitly expects no Meet UI at all on the Training page — not hidden lower down, not a duplicate "skinny Board," not Meet A/Meet B controls below Board. Meet is a separate surface. PR #124 addressed one implementation of this.

**2.55 Meet is currently secondary.** After South Island competition, Andy concluded: the experiment was useful and helped clarify the eventual product, but the existing implementation is too complicated; typing lots of times/splits manually while coaching is cumbersome; live voice recognition was not reliable enough; effort should return to Training reliability. Do not spend the next development cycle polishing Meet unless Andy explicitly re-prioritises it.

**2.56 Long-term Meet workflow should be simple:** programme → swimmer → race context → one simple Race capture → result/splits → technical observation → post-race report. Remove duplicated controls.

**2.57 In live race dictation, the assistant must be silent.** Relevant if Claude ever becomes part of live capture interaction. When Andy is dictating race observations: do not speak until Andy explicitly says finish, asks for the report, asks a question, or clearly asks for output — not even "I'll stay quiet." Speech previously talked over him and corrupted race capture.

**2.58 "The report is the product."** Raw transcript, audio/video, split entries = evidence. Final structured coaching report = user product. Future voice approach: record silently → stop → transcribe/process → structured report, not conversational turn-taking during the race.

**2.59 Race reports must distinguish spoken vs. calculated data.** If a final time is spoken and partial splits are spoken, label calculated subtractive splits — do not pretend they were spoken. Never invent an unclear decimal/name/event; mark ambiguity.

**2.60 Jordan and Matthew are different role problems.** Jordan is an assistant coach needing the coaching interface (close to Andy's poolside view) with limited permission. Matthew is the remote swimmer reference case. Do not conflate them.

**2.61 Assistant coach access should be assignment/capability based.** Jordan needs Board, Roll, Times, Capture, relevant Meet — not owner settings, all squads, all athletes, cloud repair, data admin, release controls, or private owner notes.

**2.62 Swimmer access is self-only.** A swimmer device should not merely hide other athletes in UI while still being able to query them — server-side policy should make cross-athlete access impossible.

**2.63 Do not use a shareable permanent code as swimmer security.** Andy specifically worried Matthew could pass a code/link to someone else. Access needs authentication, scoped identity, expiry/session management, revocation, server-side data restrictions.

**2.64 Parent portal is a future communication product, not current unrestricted access.** Purpose: improve parent understanding, reduce repetitive coach questions, improve athlete support/buy-in. Must only expose deliberately published information.

**2.65 Desktop and phone have different jobs.** Desktop can be the deep planning/data/analysis/history/reporting/admin home; phone must remain independent as the poolside tool.

**2.66 Performance pathway default view should remain concise:** current PB; one or two achievable intermediate steps where valid; applicable future age/course qualifying milestones; current national age-group target (e.g. NZSC/NAGS). Do not put finalist/medal/open-winner/national-record benchmarks in the default compact pathway — those belong in deeper detail.

**2.67 An explicitly opened pathway remains open** until the coach closes it, changes swimmer, or navigates away — delayed hydration/rerender must not collapse it.

**2.68 Performance truth requires correct NZ age/visitor interpretation** where reporting national meets — distinguish raw placing from NZ placing if visitors are ahead; age-group structure matters; avoid presenting a foreign visitor ahead as meaning the NZ athlete wasn't first NZer. Mostly reporting logic, but reflects the broader rule that domain context matters.

**2.69 PB reconciliation remains conservative:** exact/credible athlete identity matching only; SCM and LCM remain separate; no conversion should replace actual PB; unknown athlete identity remains unresolved rather than guessed.

**2.70 Reports should explain coaching reality, not dump data** — intended work, delivered work, modifications, response, progression, carry-forward.

**2.71 The dosage model must be transparent.** Any physiological weighting is a coaching model, not laboratory certainty — the coach should be able to understand how a number was derived.

**2.72 AI should expose evidence behind conclusions.** The valuable query isn't "why is Charlotte struggling?" but "what evidence supports the hypothesis that this training exposure is related?" The system needs to distinguish observed fact, correlation/pattern, coaching hypothesis, and unsupported speculation.

**2.73 PWA delivery is part of release correctness.** PR #117 fixed T400 selection but the live installed phone retained old runtime because no release/cache signal changed; PR #118 existed solely to ship those bytes. A logical code fix is not complete until the installed PWA is actually guaranteed to receive the changed asset. Any runtime change needs release/cache/version consideration.

**2.74 Never claim deployment merely because source is merged.** Verify release authority, service worker, cache-busting/version, actual delivered asset, phone update/reopen behaviour.

**2.75 CI is necessary, not sufficient.** A green Guardian does not override real field failure. A unit regression does not prove Android lifecycle, browser Back, PWA cache update, main-thread responsiveness, actual phone rendering, or actual poolside behaviour.

**2.76 Failing unrelated acceptance should not be "fixed" by weakening it.** When Training changes hit a known unrelated (e.g. Meet) failure: acknowledge it, do not weaken/delete the test, do not make unrelated changes to force a pass, fix it separately when that area is prioritised.

---

## 3. In-flight work at handover

**3.1 Architectural consolidation is the highest-value next technical task.** Andy explicitly asked for: every place engines share responsibilities; every cross-domain writer; bridge problems; places fixes became patches; actual current runtime evidence. The previous attempted writer map should not be accepted as authoritative without redoing it against live current `main` — there was a snapshot mismatch (an older static export suggested some files/modules didn't exist/load; current PR #126 logs show `engines/live-training-authority.js` loaded and many Meet modules loaded). Build the writer map from current bytes.

Recommended audit domains: `M.BUILD`; canonical sessions; `selectedSessionId`; `settings.view`; `surfaceMode`; attendance; adaptation overrides; target outputs; evidence; Meet state; `M.store.save`; navigation API; live payload/apply; render ownership; cloud pull/apply; role/auth state. Classify every writer as OWNER / ADAPTER / PROJECTION / ILLEGAL WRITER. Do not use load order as a substitute for ownership.

**3.2 Compare current runtime to `architecture/AUTHORITY_MAP.md`.** The map (dated 23 Aug) names these owners: canonical session/parser/live edits → `v4-poolside-core.js`; evidence primitives → `engines/evidence.js`; aerobic/T400 → `engines/aerobic.js`; race-specific targets → `engines/race-pace.js`; modification → `engines/modification.js`; prescription coordination → `engines/coordinator.js`; persistent local operational state → `engines/storage.js`; attendance → `engines/attendance-roster.js`; training history → `architecture/training-history-core.js`; athlete/session boundaries → `architecture/athlete-session-core.js`; raw evidence semantics → target architecture `architecture/evidence-core.js`; context → target architecture `architecture/context-core.js`; interaction/voice → `architecture/interaction-core.js`; Meet → Meet domain; Board/TV/swimmer → projections; Guardian/release → CI/contracts; build identity → still a consolidation target; squad stimulus → still a consolidation target. The map lists transitional debt including `v4-correct.js` and other wrappers — verify whether all listed wrappers are still loaded before acting, since the map is dated 23 August.

**3.3 Current `app.js` responsibility load should be investigated** — repeatedly identified as the underlying structural issue. Things historically originating in `app.js`: global state bootstrap; original store; canonical session lookup; original navigation; original live/BroadcastChannel; UI dispatcher; some rendering; cloud integration; Meet base model; actions. Intended domain engines often load later. Do not start moving code until you know exactly which implementation currently wins at runtime.

**3.4 No full device acceptance exists yet.** A protected real-phone journey is still outstanding: Open → verify correct session → Board → Roll → modified swimmer → target → Times → Capture → background app → resume → navigate Back → Finish → historical reopen, checking no freeze, no unsolicited navigation, same selected session, Roll retained, Board unchanged except explicit edits, modifications retained, correct targets, captures retained, scroll/context retained, Finish correct, historical reopen exact.

**3.5 Current FPA failure: SISC swimmer intel delayed persistence.** PR #126 Final Product Acceptance stops at `tests/meet-sisc-swimmer-persist-20260828.cjs`, waiting for `.ba-intel`, timing out. This issue predates the recent Training repairs — do not misattribute it to PR #126. Because it fails early, later steps do not run: SISC full-programme authority after meet switch; Meet programme Android acceptance; Meet phone-priority controls acceptance; Add new meet Android acceptance; explicit meet selection authority; all-inclusive coach journey at Android shape; phone target loading and stroke scroll stability. Those later checks are currently unproven on current PR bytes.

**3.6 Password/authentication issue remains unresolved.** Andy specifically reported "the password is wrong." No verified root cause established. Do not guess what password is intended. Potential areas to inspect: `engines/access-authority.js`; swimmer invite/auth flows; Supabase Auth; local auth token; role binding; session expiry; legacy login state; swimmer portal authentication. Do not ask Andy to repeatedly change passwords/sign out while debugging unless evidence makes that necessary.

**3.7 Supabase security warning remains a handover concern.** Andy received a Supabase email warning about detected security vulnerabilities and separately asked for the project to be secured without disrupting the working app/data. *(Status update, 3 Sept 2026: Claude has since obtained live Supabase access and completed an initial remediation pass — see "Supabase security remediation" note below. The items ChatGPT flagged for inspection — Security Advisor findings, RLS state, public tables, anon permissions, storage bucket policies, RPC/function exposure, role policies, auth settings, and whether swimmer/assistant access is actually enforced server-side — have been reviewed; production policies were not changed blindly, client queries and expected roles were mapped first via the actual RLS policies on each table before any fix.)*

**3.8 Jordan assistant-coach setup is still a priority.** Goal: get Jordan working on his phone as assistant coach. Do not design a separate coach product unnecessarily if current capability/role architecture can already expose the required tools. Verify: role assignment; squad assignment; permission boundaries; login/invite process; owner-only functions absent; appropriate athlete scope; auditability.

**3.9 Matthew remote-swimmer setup is still a priority.** Goal: secure remote swimmer experience — own training, own individual prescription, own pathway, own performance, deliberate shared evidence, feedback capability, secure invite/auth process rather than a reusable permanent code. Tests such as `tests/matthew-ready-cv.cjs` passing in current FPA does not prove actual secure remote phone onboarding and Supabase policy.

**3.10 Swimmer-facing Board / individual device is partly built, not complete.** Product direction is settled; live end-to-end proof is incomplete. Verify: current work first; correct individual modification; targets; no other-athlete data; session changes propagate; offline cached access; phone layout; security.

**3.11 Parent portal is future scope** — do not divert current stabilisation work into building it.

**3.12 Meet should mostly stay shelved during Training stabilisation.** Existing Meet code must not be broken (contains useful field learning), but do not make Meet the centre of the next development cycle. Exception: the current FPA failure may need enough diagnosis to allow acceptance to continue — resist turning that into another Meet feature campaign.

**3.13 Import/link latest meet results back into performance/training** was a stated post-meet priority. Results should feed PB truth, performance history, pathway, race-pace modelling where applicable, race observations, future planning — not merely be stored. Verify what has/hasn't already been imported before duplicating.

**3.14 Architecture-folder cutover remains unfinished.** Current runtime loads five `architecture/` modules; the folder contains substantially more. For each candidate: identify intended owner → identify current live owner → identify whether the architecture module is complete → compare behaviour/tests → replace owner cleanly → remove obsolete writer → add ownership test. Do not wire all of them blindly.

**3.15 Build identity is still explicitly a consolidation target** — `AUTHORITY_MAP.md` says it should become one build manifest. Do not leave multiple files independently assigning release identity indefinitely.

**3.16 Squad Stimulus Profile is planned, not finished.** Future owner should provide a stable squad reference for prescription/promotion decisions — avoid implementing comparison purely from current attendance.

**3.17 PB/result reconciliation remains incomplete.** Be conservative: match real athlete identity; retain course; do not turn conversions into PB truth; flag ambiguity; do not invent missing historical results.

**3.18 Carry-forward / makeup integration remains future work.** Missed/disrupted relevant training can affect future planning, but do not automatically "make up metres" — carry-forward needs coaching context, not arithmetic debt.

---

## 4. Known issues / landmines

**4.1 There has never been a user-accepted full phone pass.** The single most important expectation-setting fact. Do not tell Andy "this is now fully fixed," "the app is stable now," or "full acceptance passed" unless he actually performs and accepts the real phone journey.

**4.2 Wrong-session takeover has happened repeatedly** — expected full session suddenly replaced by a 50m Warm-up; historical session reappearing; wrong AM/PM/date; old/past session becoming writer target; browser Back influencing session; background refresh influencing selected session. PR #125 removed one known history writer — do not assume all paths are gone.

**4.3 A real session was completely lost.** The Wednesday night session on 12 August was lost entirely after phone failure — confirmed destructive behaviour. Any persistence refactor must begin from the assumption that data loss is unacceptable.

**4.4 A 4,100m live session was bound to wrong historical identity** — a Thursday session showed as "PAST · Wed PM · 12 Aug / Wed PM · Nat + Dev + Fit" while the actual intended live context was different. Session identity and writer target can diverge even while distance itself looks reasonable.

**4.5 Board can change to a "Complete session" state without user navigation.** Andy reported simply scrolling down Board and suddenly landing at "Complete session / Run or review each block / No complete blocks saved yet" followed by a freeze. Treat any similar view change as an authority bug, not user error.

**4.6 Roll has disappeared after being entered.** Correction to an earlier mistaken interpretation: when Andy showed a correct Roll again, he had manually re-entered it — that is not proof persistence worked.

**4.7 Roll must not mutate canonical session** — hard invariant: attendance count/status changes must never trigger reparse, canonical session rebuild, change of total distance, or change of selected session.

**4.8 Phone freezes have occurred in normal poolside use.** Known freeze triggers/contexts: Guardian/back/reopen; Swimmers page; changing athlete; changing squad filter; Capture; Notes; large Main Set; Meet switching; background/foreground; simply scrolling. A desktop/browser test does not invalidate this field evidence.

**4.9 Swimmer selection snapped back to Alex Gibson.** Explicit user selection must stick — do not reapply a default selected athlete after interaction; background hydration cannot reset it.

**4.10 Squad filters have snapped back** — same ownership rule as swimmer selection.

**4.11 Capture/Notes have triggered heavy re-renders.** Capturing evidence should persist local evidence, update minimal UI, and return control immediately — not reconstruct Board/session state.

**4.12 Main Set size can make essential controls unreachable** — see poolside UI decisions above.

**4.13 Parser nested-round scope has failed.** A nested `2 Rounds` marker has previously attached to the wrong scope, detaching cues/intervals. Regression should check local/nested repeat scope, not just top-level rounds.

**4.14 Parent/child parsing remains an active concern.** Recent 400/300/200/100 discussion described a likely mismatch between parse structure and visible child structure. Do not "correct" distance independently of structure — inspect AST/canonical hierarchy and Board projection together.

**4.15 Phantom metres have been a recurring parser failure.** Internal child distances must not sum independently unless actual work.

**4.16 Race-pace shorthand was recently missing targets.** `50 #1 @100p @1:30` was displayed with only `Auto`/`@1:30` rather than target times. PR #126 is the current code repair — still requires real phone verification.

**4.17 Modified aerobic targets have been missing.** Para/modified swimmers have displayed correct work but no target where a T400/model should supply one. Do not "fix" this by showing targets everywhere.

**4.18 Targets have also appeared where not needed.** Need correct classification, not blanket visibility.

**4.19 Race-pace modified send-off errors occurred.** Example regression: McKenzie modified 12×50 quality work to 8×50 but retained an inappropriate squad send-off rather than the expected ~`@1:45`. This became a protected fixture.

**4.20 T400 old-test selection was wrong.** PR #117 fixed current anchor selection — do not regress to "fastest ever T400."

**4.21 A code fix can fail to reach the installed phone.** PR #117 → #118 is the precedent — always verify service worker/PWA delivery.

**4.22 Meet has had observer cascades and phone freezes.** PR #108 addressed a MutationObserver cascade during Meet switching. If touching Meet rendering, inspect observers very carefully.

**4.23 Meet has had duplicate/legacy surfaces reappear.** PR #109 hard-hid a legacy Meet deck after it resurfaced under the newer programme — evidence of overlapping Meet render authorities.

**4.24 Meet swimmer intel delayed persistence remains failing** — current FPA landmine. Do not assume PR #110 permanently solved it.

**4.25 Meet simple overlays were explicitly short-term.** PRs #111, #113, #115 were focused on making a competition usable quickly. Do not treat their layering style as the desired permanent architecture.

**4.26 Current Meet runtime is historically layered.** Current PR #126 CI load logs show files including `engines/meet-field-au.js`, `engines/meet-ops-av.js`, `engines/meet-board-az.js`, `engines/meet-program-ba.js`, `engines/meet-aqua-expand-df.js`, `engines/meet-sisc-format-dz.js`, `engines/meet-program-ops-bridge.js`, `engines/meet-board-ay.js`, `engines/meet-workspace-cy.js`, `engines/meet-poolside-de.js`, `engines/meet-sunday-simple.js`, `engines/meet-tomorrow-usable.js`. Do not add another Meet overlay without first deciding what the permanent owner should be.

**4.27 Static export versus live repo discrepancies are a known handover hazard.** At one point an external/static read reported that `engines/live-training-authority.js` did not exist and fewer Meet files were loaded. Current live PR #126 logs contradict that. Conclusion: never derive architecture state from an old zip/export when live `main` is available.

**4.28 `AUTHORITY_MAP.md` can also become stale.** It is a guardrail, not magical truth — check current load graph, actual assignments, actual writers, tests. Update it when consolidation changes.

**4.29 Old/recovery branches and files can confuse investigation.** The repo historically contains many emergency/hotfix/recovery/correction/contract-fix/old-Guardian/Meet-overlay files. Do not search by function name and edit the first result — confirm whether the file is loaded in current `index.html`/service worker/runtime package.

**4.30 Guardian/architecture tests have sometimes provided false confidence.** Some architecture tests historically checked known-bad filenames absent + load order + final binding, rather than true single-writer semantics. A test that says "final owner loads after base owner" does not prove "there is only one owner."

**4.31 Final Product Acceptance stopping early hides downstream failures** — as of current PR #126. Consider making acceptance report all independent failures where feasible, rather than skipping every later check after the first non-dependent failure, without weakening hard gating.

**4.32 Real Android behaviour is not equivalent to Playwright browser size.** Phone lifecycle includes PWA process suspension, OS memory pressure, app switching, screen lock, browser Back, camera/media transitions, service worker, touch queuing, device main-thread performance.

**4.33 User data from the old desktop recovery is valuable.** A strong recovery from the older desktop on 26 August found approximately 153 canonical sessions, 73 swimmers, 280 attendance records. Sophie Newlove was correctly inactive in that recovery. Do not casually discard or overwrite historical state during migration.

**4.34 Old lane-assignment sync had duplicate-key retries.** Historical error: `session_lane_assignments_pkey` duplicate violations on existing assignment IDs. Intended fix was idempotent upsert/conflict-safe sync. If related old tables or queues remain, do not reintroduce insert-only retries.

**4.35 Stale module/build labels have caused confusion.** A Connection screen once displayed old build/module label `3.20.8-stable-test-platform-sync-repair-20260807` while newer app versions were running. Build identity should distinguish application release, module build, and schema/sync engine version — don't make a subsystem label look like app rollback.

**4.36 `Past` UI is probably redundant, but do not remove it casually.** Andy felt calendar navigation already handled historical sessions and "Past" might be redundant — but history/session recovery has been fragile, so any simplification needs to preserve access to actual historical truth first.

**4.37 Password/security issues must not be "fixed" by relaxing access.** Never solve authentication frustration by exposing data publicly.

---

## 5. Patch-loop history

How development repeatedly produced regressions, and what patterns must not continue.

**5.1** The initial V4 architecture concept was sound — one owner per domain, clear engine interfaces, no cross-owner patches, local-first, canonical session, protected projections. The problem was not the philosophy.

**5.2** Migration was not completed before feature development continued. The large base application remained; domain engines were added around/after it, producing: base implementation in `app.js` → later engine replaces function → later compatibility layer wraps result — rather than one authoritative engine called by shell. Any new bug could then come from base code, replacement engine, bridge, projection, hydration, service worker, cloud, or old overlay.

**5.3** Compatibility layers became semi-permanent. Instead of removing the old path after a successful engine migration, layers like `v4-correct.js`, bridges, compatibility modules, old rendering fallbacks remained. `AUTHORITY_MAP.md` itself acknowledges this debt.

**5.4** Poolside urgency rewarded symptom fixes. When Andy needed the app for actual training or a meet that same day, there was pressure to make a visible failure disappear immediately: real field bug → locate closest intercept point → add targeted condition/overlay → targeted regression passes → ship → unrelated later writer still exists → next user interaction exposes the competing writer.

**5.5** Meet week accelerated the overlay pattern (PRs #107–#115): fixing Meet switching/video access, stopping observer cascades, hard-hiding a legacy Meet deck, persisting SISC swimmer intel after refresh, a "protected one-box overlay" explicitly described as thin, narrow delayed retries/suppression, delivery-only PWA fixes, hiding old controls without redesign. Understandable competition-time triage — not a model for permanent design.

**5.6** Training then exposed the same structural problem (PRs #116–#126, see section 9 for full list). Key inflection: PR #122 (`Recover Sep 1 live Board truth and hard-isolate Meet`) was the point where the process violated the desired philosophy most clearly — a specific historical session recovery condition was added. PR #123 (`Fix operational state authority at the root`) corrected course: removed session/date-specific recovery, blocked delayed hydration from replacing active operational state, made session repair explicit-only, tightened navigation surface isolation. Each subsequent narrow fix (#124, #125, #126) found another authority/path that should have been mapped before patching.

**5.7** We repeatedly tested the symptom rather than proving domain exclusivity. A regression proving "stale BroadcastChannel message does not overwrite this session" does not prove "no other runtime component can overwrite selected session" — that's why PR #125 found browser history after PR #121/123.

**5.8** Architecture tests sometimes codified transition debt rather than testing the constitution. If a test accepts two storage writers (base + later replacement) with specific load order, it's proving the transition arrangement, not the architecture. Future architecture tests should test prohibited writes, sole ownership, immutable contracts, no wrapper assignment, no domain writes from projection.

**5.9** UI hiding was sometimes used to mask authority conflict (e.g. legacy Meet surface reappeared → hard hide). Useful as competition triage, but if a legacy renderer is still running and producing the node, permanent architecture should eventually remove/retire it rather than rely forever on CSS.

**5.10** Date-specific recovery was tried and rejected — PR #122 is the canonical example. Do not repeat it.

**5.11** Delivery/version bugs repeatedly made source fixes appear ineffective. Without PWA cache/version propagation, correct source can exist while the phone still runs old bytes — the user reports no change, and a developer may incorrectly "fix" logic a second time. Any investigation must first establish the exact live build on the phone.

**5.12** Fixes were sometimes declared too early, which damaged trust more than the individual bug. New rule — describe scope exactly. Good: "PR removes history as a selected-session writer. CI regression passes. Real-device session stability remains unproven." Bad: "Session switching is fixed."

**5.13** A green subset became psychologically confused with a green product. PR #126 demonstrates why not to do this: Architecture Foundation / Training prescription policy / Morning Board / Swimmer Surface / Live Training Authority / Engine Acceptance / Coherent Runtime / Full Guardian all succeeded — Final Product Acceptance failed, and later phone checks were skipped.

**5.14** The user was repeatedly asked to reproduce or manipulate live state. Andy explicitly rejected being asked to change things "for our benefit." Do not ask him to retake Roll, enter a fake session, switch around the app, or deliberately trigger destructive paths unless code inspection cannot answer it, the test is safe, and there is a clear reason. Use automated/repo/state investigation first.

**5.15 Future repair method for any defect:**
1. Capture actual failure (screenshot, exact source/session, current build, actual user action, persisted data if safe).
2. Establish current loaded runtime — do not trust filenames from memory.
3. Identify all readers/writers of the affected state before editing.
4. Identify intended owner from Authority Map/product contract.
5. Reproduce in an exact test.
6. Repair owner only — no second policy layer.
7. Remove obsolete writer where safe — do not merely out-load it.
8. Add architecture regression to prevent the same ownership-violation class.
9. Run domain regressions.
10. Run full acceptance.
11. Ensure release/PWA delivery.
12. Real phone field verification.

Only then call it accepted.

---

## 6. Swimmer / athlete-specific context

Database values should be checked first — this records coaching intent and known special rules that may not be fully represented in data. Do not assume a name similarity means the same athlete.

**6.1 Charlotte Murphy** — significantly modified swimmer. Working guidance: roughly half squad volume / just over half where sensible, preserving the same stimulus and coaching theme. Historical Modification code used a `.50` fallback — do not interpret as half the pace, half every set, or half every technical repetition; quality/short skill work can sometimes remain closer to squad exposure. Charlotte's case often exposed whether modified swimmers were missing correct aerobic targets; her Board prescription needs to remain swimmable and practical. Known race evidence (50 Fly, 58.92: first 25 27.57 SR~47, second 25 calc 31.35 SR~46; feet out of water during breath, breath held out too long, very little kick off turn, body-position/kick connection issue) — check DB before duplicating.

**6.2 McKenzie Drage** — modification guidance ~2/3–3/4 squad load depending on work, 2/3 as current low-confidence/default fallback. Critical exact regression: Saturday quality set `12×50` → modified McKenzie prescription should resolve to `8×50 @1:45` in the protected fixture, not blindly retain an inappropriate squad cycle. Do not treat 2/3 as a speed multiplier — volume modification and target calculation must remain separate.

**6.3 Amber Proudfoot** — general guidance ~2/3, but with more specific functional prescription considerations than a generic ratio. Historical explicit Amber modes: Pull, Swim, Paddles, Drill, Scull, Body alignment (Scull potentially needing very slow cycle allowance). Do not remove special functional constraints for a generic Modification engine — represent as explicit athlete capability/profile data if not hard-coded.

**6.4 Conor Fischer** — current historical fallback ~0.50 volume. Has a coach-verified Breaststroke T400 fallback: 545.2 seconds = 9:05.2. Verify Supabase for a newer actual result before using the hard-coded fallback. Do not fall back to Freestyle when asking for Breaststroke target data. Known race evidence: 100 Breast 1:56.76 (first 50 56.92 SR32, second 50 calc 59.84; dive more stable, first length smooth/long, needs steeper build, more explosive kick, improve hand connection); 200 Breast 4:01.83 (previous Rangiora 4:08, improvement ~6.17s).

**6.5 Ruby Stace** — general modification ~2/3. Para context: S13 — do not replace para pathway with able-bodied standards when classification-specific pathway exists. Known 50 Free: 38.66 (first 25 18.35, second calc 20.31, SR ~53 early).

**6.6 Matthew Kofoed** — historical Modification fallback ~2/3. **Multiple Matthews exist in the programme — do not infer athlete identity from first name.**

**6.7 Matthew Robertson** — different athlete from Matthew Kofoed, significant performance/race evidence. Two separate 200 Fly swims must remain separate records: Swim A 2:29.24 PB (25 14.50 SR60; 50 31.30 SR58.8; 100 1:08.60 → second-50 37.30 SR~56; 150 1:50.98 → 42.38 SR collapsed ~35; final 50 38.26, rate recovered ~36–43; hesitant/floppy start, rate collapse, breathing deteriorated, breathed first stroke, good final turn and late lift). Swim B 2:21.97 (50 31.70; 100 1:07.60 → 35.90; 150 1:44.44 → 36.84; final 37.53; SR ~49–50; flopped blocks, breathed first stroke after walls, almost paused breakout, stable rate but not holding water, every-two breathing in final 50 better). Known 400 IM: 5:13.86 (Fly 1:08.00 / Back 1:25.17 / Breast 1:28.98 / Free 1:11.71; improvement ~1.87).

**6.8 Matthew — remote swimmer product reference.** The "Matthew" referred to in portal/product discussions is the remote-swimmer reference case — do not assume this means a particular database Matthew without checking. The product requirement matters more than the identity shorthand: secure own-only portal, own programme, own performance, pathway, shared coach information, feedback.

**6.9 Sophie / Sophie Newlove** — historical para modification guidance S19, ~3/4 where appropriate. The recovered old desktop roster correctly had Sophie Newlove inactive — do not auto-reactivate her due to old adaptation metadata.

**6.10 Elsie Knowles** — important pathway acceptance fixture. SCM 200 Breast: PB 3:20.78, NZSC target 3:00.55, ~11.2% away. Other gaps: SCM 50 Breast ~11.4%, SCM 200 Free ~12.0%. In a controlled 362-WA 200 Breast fixture, expected visible steps: 375 WA → 3:18.43, 400 WA → 3:14.21, NZSC → 3:00.55. Default pathway should not clutter this with medal/record standards. Known race 200 Free: 2:31.94 (33.19/39.51/40.22/39.02; got out well, good rhythm, strong third 50, final under 40). 50 Free: 55.16, SR ~39→38.

**6.11 Alex Auer** — historical operational fallback used 400 Free = 5:23.0, June 2026, when no stored matched T400 anchor existed (added to keep an operational target path working during earlier v3.20.24 work). Do not prefer it over newer real stored evidence.

**6.12 Alex Gibson** — a previous UI default athlete. Do not let background hydration/default selection snap the Swimmers page back to Alex Gibson after the coach has explicitly selected another swimmer.

**6.13 William Callow** — race evidence exists. Name recognition landmine: voice once produced "William Kellow," but the known athlete is William Callow — do not silently rewrite ambiguous voice names without context. 50 Free: 26.08 (25 12.60 SR61; second calc 13.48 SR58.8). 100 Fly: 59.53 (28.50/31.03, strong back half). 400 IM: 4:42.60 (Fly 1:04.20 / Back 1:09.80 / Breast 1:23.19 / Free 1:05.41). A previously derived final split of 28.26 looked mathematically possible from dictated cumulative data but unusually fast — verify raw source rather than treating it as certain.

**6.14 Luke Thompson** — 50 Fly 27.17 (12.27 SR58 / calc 14.90; awkward around breath first length, tipping slightly). 200 Free 2:03.07 (28.16 SR44 / 31.67 SR43 / 32.20 SR42 / 31.04 SR44; smooth first 25, good pull/full kick off wall, pace off at 100 turn, stronger final 50). 50 Free 24.79 (11.82 SR61.6 / 12.97 SR64.9). 100 Free 53.58 (12.42 SR47.8 / 13.67 SR52 / 13.87 SR50 / 13.62 SR50; 50s 26.09/27.49). 100 Fly 1:01.03 (27.90/33.13; great turn/breakout, faded).

**6.15 Coral** — surname not reliably established from voice context; do not invent one. 50 Fly 34.43 (16.06 SR59 / calc 18.37 SR59; hands/pull on dive better, good rhythm/breakout/leg drive, last breath before flags). 200 IM 2:51.54 (Fly 36.30 / Back 43.70, SR~38.4 / Breast 52.45 / Free 39.09; came back well, breast strong, strong free). 100 Free 1:09.39.

**6.16 Ashley Brown** — 200 Breast 3:15.88 (44.10/50.00/51.10/50.68; spoken 150 cumulative inconsistent — mathematical cumulative at 150 is 2:25.20; SR progression ~35, 34.6, 37.9, 39.6, 42.8). 100 Free 1:11.42 (first 50 ~33.8). 50 Free 32.06 (15.40/16.66, SR ~49).

**6.17 Molly** — 200 IM 2:49.34 (Fly 34.50 / Back 45.74, SR~35.7 / Breast 50.70 / Free 38.40; attacks fly hard, breast deep recovery, more consistent free kick, strong finish). 200 Breast 3:13.16 (43.00/48.88/51.10/50.18; SR 34.7 then ~28, 30/29, 30, 33). 400 IM 5:59.05 (Fly 1:20.16 / Back 1:36.24 / Breast 1:43.17 / Free 1:19.48; controlled fly, great underwaters, strong negative free).

**6.18 Awatea** — some dictated race attribution is ambiguous; preserve uncertainty. 50 Fly 33.69 (15.42 SR65 / calc 18.27 SR64; nice tempo out, breathing every stroke into final few metres of first 25, nice breakout, high rate, needs more leg drive home, sub-34 achieved). 200 IM 2:52.60 (Fly 37.20 / Back 43.80 SR36.8 / Breast 53.71 / Free 37.89; fly too costly, faded breast, free good but missing catch). A 200 Free ~2:26.36 may be Awatea but attribution was garbled — treat cautiously.

**6.19 Matthew Kellow** — distinct from William Callow. 100 Fly 1:04.07 (25 13.70 SR57; 50 30.14; 75 47.25 SR54; first stroke initially no breath, later did; strong shape). 400 IM 4:56.70 (Fly 1:07.28 / Back 1:15.38 / Breast 1:26.59 / Free 1:07.45; walls/breakouts sluggish, strong overall race).

**6.20 Squad model** — categories currently/historically include National, Development, Fitness, Intermediate, Junior, Novice Para, and possibly others in the database. The session has lead squad(s), but cross-squad individual attendance must be possible without changing session identity — "not in session's primary squad" does not mean "cannot attend."

**6.21 Mixed-lane coaching model** — for mixed IM/stroke-specialist groups: IMers can rotate strokes or use focus stroke; specialists can work #1 stroke; shared purpose should remain clear.

---

## 7. Additional technical / product context — protected regression fixtures

**7.1 Protected Saturday 15 August fixture** — one of the best regression fixtures (long session, repeated patterns, technique, aerobic, race pace, modified swimmers, target logic, total distance). Session: AM · 2026-08-15 · National + Development + Fitness + Guardian. Total: **5,450m**. Block totals: Warm-up 1,100 / Pre 850 / Main 2,900 / Post 600.

Warm-up: 500 (300 Free / 200 Reverse IM); 12×50 #1 Stroke; 4 rounds Scull/Drill/Swim Perfect Technique.
Pre: 3×200 Pull Desc Stroke Count; 5×50 Kick Build @1:00.
Main: 2×400 Free Regeneration/Development, 10s rest; 8×12.5 MAX @0:45; 3×150 (100 IM/50 Free, build, strong final 25, attack last turn/underwater, finish); 6×25 #1 Stroke @1:00 (#1 Build, #2–6 @100m RP); 8×100 Free (#1–4 Overload, #5–8 Threshold, 30s rest); 100 Scull easy reset; 4×50 #1 Stroke @2:30 (#1 Build, #2–4 @100m RP); 200 Easy; 1×100 #1 Stroke MAX, Target Second 100 of 200 Race.
Post: 8×75 fins; 50 perfect technique/25 fast; attack walls; hold line; fast finish.

Estimated duration: roughly 1:55–2:00 with real timing. Historical modified totals in fixture — Charlotte: WU 650 / Pre 550 / Main 1,800 / Post 300. McKenzie: WU 750 / Pre 550 / Main 1,950 / Post 450. Do not blindly make those totals universal rules — they're expected outputs for this fixture.

**7.2 2,100m nested-round fixture** — `3 × (5×100 Threshold + 200 Easy)` must equal 2,100m and preserve the repeated local structure. Associated with an earlier Board-authority repair discussion.

**7.3 Friday historical fixture** — expected to remain total 4,740m, Main 1,080m, repeated recovery structure intact. If this still exists in tests, do not casually update expected totals to satisfy a parser change — inspect intended authored source.

**7.4 Exact Sep 1 fixture** — total 4,300 (WU 1,200 / Pre 600 / Main 1,500 / Post 800 / WD 200). Main: 5 rounds of (200 Overload + 100 Threshold). Do not use production date-specific repair (see 2.22/2.23).

**7.5 `50 #1 @100p @1:30` fixture** — expected semantics: canonical delivered distance 50; athlete-specific #1 stroke; target event 100; race pace target calculated from valid evidence; cycle remains authored 1:30 unless prescription policy explicitly needs longer; Board should show individual target, not merely `@1:30`.

**7.6 HR Gauge fixture** — `2 × 200 IM — Clearance — 20s rest — HR Gauge`: no pace target request, no fake 00.00, HR guidance, authored rest retained.

**7.7 Odd/even fixture** — `4 × 50 #1 Stroke @1:15 — Odd 200 Pace / Even Drill`: odd reps target 200 RP, even reps Drill/no pace target, correct athlete-specific stroke, no overlapping text.

---

## 8. Development interaction with Andy

**8.1** Do not make Andy repeat settled product context — he has discussed this system extensively. If a decision is in this handover or the repo contract, use it. Ask only when a genuinely new product choice exists.

**8.2** Do not give long explanations of why a regression happened unless asked. When something is broken, Andy wants: what is broken; what exact root was found; what changed; what remains unproven. Not a paragraph explaining why the previous fix was understandably wrong.

**8.3** Do not say "I expected that." If an issue was predictable, it should have been handled before release.

**8.4** Do not claim you saw evidence you did not see. There was a prior incident where an assistant discussed a screenshot as though it had seen it, but only had Andy's description. If you don't have the file/image/state, say so.

**8.5** Do not call code "ready" based on intent. Use specific status vocabulary: reproduced; root cause identified; code changed; unit regression passed; integration gates passed; PWA package verified; real phone untested; real phone accepted.

**8.6** When Andy is driving/voice dictating, concise answers matter — do not make him parse a long technical essay unless he asked for one. (This handover document is intentionally detailed because it's for an AI engineer, not his normal interaction style.)

**8.7** Session planning should not be interrupted (see 2.51).

**8.8** Race dictation requires silence (see 2.57) — treat as hard protocol.

*Additional note from Claude, 3 Sept 2026: Andy has also directly stated a preference for slow, detailed, one-step-at-a-time instructions for setup/technical steps specifically (e.g. walking through account/credential setup) — this sits alongside, not in conflict with, 8.2/8.6: keep technical status updates concise, but when a task requires Andy to personally perform a sequence of UI actions, break it into single steps and wait for confirmation between them.*

---

## 9. Recent PR history

**#116** — `repair/training-mod-integrity-20260831` — Rebuild training prescription integrity at engine boundaries. Intent: TrainingPolicy owns final recovery; Coordinator composes; no late Modification/Board override; dormant internal helper cleanup left for later.

**#117** — `repair/t400-current-anchor-20260831` — Use current T400 test as aerobic anchor. Root fix: latest dated valid result.

**#118** — `repair/t400-deploy-authority-20260831` — Ship current T400 anchor fix to installed PWA. No training logic change; release/cache delivery only.

**#119** — `repair/sat-am-prescription-truth-20260831` — Lock Saturday modified prescription truth. Protected Saturday fixture.

**#120** — `repair/sep1-board-parser-cleanup` — Fix Sep 1 Board parser cleanup. Parser/display targeted.

**#121** — `repair/live-training-state-authority-20260901` — Lock live training state authority. Operational coach state should not accept stale display broadcast.

**#122** — `repair/sep1-live-board-final-recovery-20260901` — Recover Sep 1 live Board truth and hard-isolate Meet. Contains the historical mistake: date/session-specific repair.

**#123** — `repair/operational-authority-root-fix-20260901` — Fix operational state authority at the root. Important corrective architectural PR.

**#124** — `repair/training-surface-no-meet-20260901` — Remove Meet chrome from Training surface.

**#125** — `repair/session-selection-single-owner-20260901` — Make training session selection single-owner. History no longer allowed to select training session.

**#126** — `repair/race-pace-shorthand-targets-20260901` — Restore swimmer target times for @100p deck shorthand. **Current main.**

Current main SHA verified: `ad793e39e2beb776235185bd88ce7f1b86f753be`

---

## 10. Authority-consolidation starting point

Not a proposed code patch — the investigative order that best matches Andy's explicit request immediately before handover.

**10.1 Establish the shipping load graph.** From current `index.html`, `sw.js`, and actual network package: record every loaded JS module in exact order. Separate current shipping runtime from unused repo files, tests, and historical/recovery files.

**10.2 Build a live writer map** for each protected state:
- Build/release — `M.BUILD`, version/core, attestation
- Session — `M.state.canonicalSessions`, original/current source, change journal, `selectedSessionId`
- Navigation — `settings.view`, `surfaceMode`, history state, selected athlete, scroll
- Attendance — `M.state.attendance`, presence journal/snapshots
- Prescription — adaptation profiles, adaptation overrides, target caches, athlete stroke selection
- Evidence — T400, PB rows, results, captures
- Meet — each Meet state tree separately
- Storage — `M.store.save`, IDB writes, localStorage compact recovery, startup hydration
- Live sync — payload, apply, publish, channel receive
- UI — render dispatcher, header, Board, Roll, Times, swimmer, Meet, TV

For every assignment/mutation, classify: **OWNER / ADAPTER / PROJECTION / ILLEGAL WRITER.**

**10.3 Compare with Authority Map.** Every mismatch becomes architectural debt. Do not fix all mismatches at once.

**10.4 Identify the most dangerous cross-owner writers first**, priority based on ability to corrupt live coaching state: (1) canonical session writers; (2) selected-session writers; (3) storage/hydration; (4) navigation/view takeover; (5) attendance writers; (6) adaptation override writers; (7) target/evidence alternate owners; (8) Meet/Training crossover; (9) build/release identity; (10) purely cosmetic projection debt.

**10.5 For each consolidation change, remove an owner.** A good consolidation PR should reduce the number of writers. If a PR adds a "temporary compatibility wrapper around X," wrapper count should not increase without an explicit retirement plan — the Authority Map already says consolidation PRs should reduce or hold wrapper count.

---

## 11. Data / Supabase safety

**11.1** Treat current local and cloud state as potentially divergent — historical sync failures mean local phone, desktop IndexedDB, and Supabase may not always have identical history. Before schema/policy/migration changes, determine current tables, source of truth by domain, pending writes, local recovery history, orphaned data.

**11.2** Do not overwrite history with a re-import unless explicitly safe. Use stable IDs and upsert semantics.

**11.3** Training and Meet tables must remain separate in authority. Meet results can inform performance later, but Meet runtime cannot mutate training-session truth.

**11.4** Role security must be enforced in Supabase. Client-side `access-authority.js` is UX, not security. At minimum verify RLS for: athletes; sessions; attendance; captures; performance/results; Meet; storage media; pathway data.

*(Note from Claude, 3 Sept 2026: this has now been done for the flagged Advisor findings — see the Supabase security remediation note below — but 11.4's broader instruction to verify RLS coverage for every table in this list, not just what the Advisor flagged, is still open and worth revisiting deliberately rather than assuming Advisor coverage is complete.)*

**11.5** Media privacy matters. Swimmer/parent accounts must not be able to enumerate other swimmer videos, coach-private notes, or unrelated capture objects. Bucket policies need to match record-level access.

---

## 12. Meet live-capture data that may exist only in conversation

Some live race observations may not have made it into MSOS due to Meet instability. **Do not blindly import these — first compare against existing results/evidence.**

Relatively coherent entries: Awatea 50 Fly 33.69 (surname garbled, do not invent); William Callow 200 Free 2:01.28 (28.60 SR47/30.22 SR43/31.01 SR41/31.45; unusual hand entry/finger position, hands out to side, tempo picked up second 50, legs came in third 50, took control); Luke Thompson 200 Free (as in 6.14); Elsie 200 Free (as in 6.10); Conor 100 Breast (as in 6.4); Luke 50 Fly (as in 6.14); Charlotte 50 Fly (as in 6.1); Coral 50 Fly (as in 6.15).

Other dictated entries have ambiguous athlete/event attribution — do not normalise or import those without raw evidence.

---

## 13. Known voice-data quality rules

When processing older race transcript: never turn "1:17.9" into "1:17.39"; never assign an unknown 1:06.19 to Awatea without evidence; do not merge Ashley/Elsie/LC breast sprint fragments; do not silently decide that a garbled name is a known swimmer; calculated subtractive splits must be marked calculated; improbable mathematically derived splits should be flagged for verification.

---

## 14. Product future beyond stability

Do not start these until the core architecture is stable, but preserve the direction.

**14.1 Learning coaching OS** — long-term product value is not merely a digital whiteboard, it is accumulated coaching intelligence: session → evidence → delivered history → interpretation → next decision.

**14.2 Athlete memory** — system should surface recurring patterns automatically (e.g. same breakout issue observed in three weeks; a technical cue that consistently worked; training-mode underexposure; recurring late-race fade).

**14.3 Team/squad intelligence** — coach should be able to ask who missed key race-pace exposure, how Development is progressing relative to expected stimulus, which swimmers are ready for more squad load, where the week diverged from plan.

**14.4 Promotion/readiness** — not "can swimmer keep up with lane?" but "can swimmer receive the intended squad stimulus with an appropriate individual projection while remaining meaningfully part of the team?"

**14.5 AI evidence reasoning** — AI should answer with evidence provenance, e.g. "Possible contributor: only one completed AP session in the last three weeks, versus three in the preceding block" rather than inventing causal certainty.

**14.6 Parent education** — future parent surface may become strategically valuable because it reduces repetitive communication and improves support. Keep coach publishing control.

---

## 15. Final non-negotiables for the next engineer

1. Do not patch around a broken owner.
2. Do not add a second source of canonical session truth.
3. Do not let sync/hydration navigate the coach.
4. Do not let Roll alter workout truth.
5. Do not let Meet alter Training truth.
6. Do not let a UI renderer silently select another session.
7. Do not turn volume ratios into pace models.
8. Do not invent targets/evidence.
9. Do not silently substitute Freestyle for missing stroke evidence.
10. Do not turn converted times into PBs.
11. Do not let a model overwrite a real test/result.
12. Do not erase original session plan when live edits occur.
13. Do not count child coaching distances twice.
14. Do not make the coach operate a database on deck.
15. Do not allow Capture/Finish to become unreachable on phone.
16. Do not make cloud connectivity a poolside prerequisite.
17. Do not wipe local data to resolve a bug.
18. Do not weaken a failing acceptance test to obtain green CI.
19. Do not claim a release passed because Guardian passed.
20. Do not claim phone stability until Andy has actually used the exact delivered build successfully.
21. Do not use old static exports or conversation memory as runtime authority when current GitHub is available.
22. Do not assume an old wrapper is loaded merely because it exists in the repository.
23. Do not edit a file until you know whether it is the current owner.
24. Do not add another Meet overlay because it is expedient.
25. Do not re-litigate settled product philosophy unless the real implementation creates an unavoidable contradiction.
26. Do not speak over live race dictation.
27. Do not conflate Jordan's assistant-coach access with Matthew's swimmer access.
28. Do not expose swimmer data with client-side hiding alone.
29. Do not use a permanent shareable access code as authentication.
30. Keep the product pointed at the North Star: the system holds complexity so the coach and swimmer do not have to.

**The current technical task is not "add more MSOS." It is to make the architecture that already exists genuinely authoritative, eliminate competing writers, prove the complete poolside lifecycle on the actual phone, and only then continue extending the coaching system.**

---

## Addendum — Supabase security remediation (Claude, 2 Sept 2026)

Before this handover was written, Claude was granted live Supabase MCP access to project `cwoqjxiniuwmslltsfgi` and used it to address the Advisor findings referenced in section 3.7 / 11.4:

- **8 critical SECURITY DEFINER views** (`results_athlete_overview`, `classification_personal_bests`, `results_event_history`, `results_pb_board`, `official_personal_bests`, `results_record_gaps`, `scwc_target_gap_matrix`, `mclay_transcription_schema_health`) were running as their owner (`postgres`), bypassing the real per-organisation RLS policies on the underlying tables (`athletes`, `race_results`, `meets`, `pathway_standards`, `target_squad_standards`, `session_transcriptions`) — a genuine multi-tenant data leak. Fixed by setting `security_invoker = true` on all 8 views; verified both `anon` and `authenticated` already held the correct base-table grants so RLS now applies as intended, with no view-logic changes.
- Found and fixed a more serious issue not on the Advisor's list: `public.mclay_drop_table_policies(target_table text)` was a SECURITY DEFINER function, callable by `anon` (i.e. unauthenticated), with no internal authorization check — it would drop every RLS policy on any table named by the caller. Revoked `EXECUTE` from `anon`/`authenticated`/`PUBLIC`.
- Pinned `search_path` on 2 WARN-level flagged functions (`swim_time_seconds`, `parse_swim_date`).
- Reviewed all 21 SECURITY DEFINER functions exposed to `anon`/`authenticated` individually (not just the one above) — the other 20 (invite flows, permission checks, swimmer portal token functions, roster helpers) all have proper `auth.uid()`/owner/token-hash checks and pinned search paths; this is the normal Supabase RPC pattern and needs no change.
- Left the 6 "RLS enabled, no policy" tables as-is deliberately: 4 (`msos_owner_accounts`, `msos_swimmer_devices`, `msos_swimmer_invites`, `msos_swimmer_payloads`) are only ever touched through the vetted SECURITY DEFINER functions above, so zero direct-access policies is the *correct* locked-down state. The other 2 (`mclay_result_backup_20260811`, `mclay_v3213_snz_results_stage_20260811`) look like one-off import/backup tables from 11 Aug — safe as locked out, possibly safe to delete outright during a future cleanup pass, not touched here since that's a data decision.
- Not fixable via SQL: "Leaked password protection" (HaveIBeenPwned check) is an Auth dashboard setting, still needs to be enabled manually.

This does not mean Supabase security is fully audited — 11.4's instruction to verify RLS coverage for every table category (not just what the Advisor flagged) is still open.
