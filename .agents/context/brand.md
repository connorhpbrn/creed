# Creed Brand

The vision-and-mythology layer beneath the product. `product.md` says what
Creed is, what must stay true, and what we are building. This file says what
Creed *means*, so the name, the voice, and the imagery all pull in one direction.

## The name

A creed is a short, deliberate statement of what someone believes and stands
by, written to be read back. That is the whole product in one word: a small,
canonical file of who you are, what you value, and how you want to be treated,
that your agents read before they act. The user does not "fill out a profile."
They write their creed.

This is why the file is treated as singular and sacred, not as storage. You
can have a hundred notes. You have one creed.

## The promise

**One file across every agent.** Write yourself down once; every AI you talk
to reads the same page before it answers. The enemy is the re-explaining tax,
the cold start in every new chat. The promise is that you never pay it again.

## The core motif: a file held sacred

The through-line of the whole brand is quiet reverence for a small, true
document. Not religiosity, restraint. The file should feel like something a
person is proud to keep open and would read out loud to introduce themselves,
not a settings panel or an inbox to triage.

Everything downstream serves that motif:

- Curation over accumulation. A creed earns its length; it is kept sharp, not
  grown. See `product.md` and the quality rubric in code.
- Agents are co-authors who propose, not writers who dump. The file is
  protected from becoming sludge.
- The interface stays calm so the document, not the chrome, is the thing you
  notice.

If a feature makes Creed feel like a notes app, a memory feed, or a dashboard,
it is off-brand before it is off-strategy.

## Voice

Calm, precise, editorial. Closer to a quiet design publication or a well-set
book than a SaaS landing page. Write like someone with taste who has nothing
to prove.

Prefer:
- Short, declarative sentences. Lead with the answer, not the setup.
- Concrete nouns (file, section, agent, proposal) over abstract claims.
- Sublines that explain the headline in one clause, never restate it.

Avoid:
- Em dashes anywhere (a hard house rule; use a hyphen, a comma, or rephrase).
- Hype words ("revolutionary", "AI-powered", "next-gen", "supercharge").
- All-caps labels, exclamation marks, and emoji (unless the user asks).

The brand-voice summary in `product.md` is the practical copy reference.

## Imagery and type

- **Imagery is painterly and atmospheric, not techy.** The landing hero and
  auth screens use hand-made scenery (`public/assets/landing/scenery/`, paired
  light/dark for hero and auth) served full-bleed: the page background fades
  over the lower edge so the art melts into the page rather than sitting in a
  frame. It evokes calm and craft, rhyming with "creed" without being literally
  religious.
- **Type is one modern family.** Everything, including the landing hero, runs
  in Geist Sans, with Geist Mono for tokens, config, and code. (The hero was
  previously set in an EB Garamond serif; that register was dropped in favour
  of a single neutral, precise sans across the whole surface.)

## Palette

Restrained and warm. A paper-like light background (`#f9f9f8`) and a near-black
dark (`#0e0e0d`), low chroma throughout. The only real color is the per-section
accent set, so a user's own context is the brightest thing on the page. Color
is meaning here, not decoration. Implementation tokens and accents live in code.

## What the brand is not

- Not a playful startup with mascots, gradients, and exclamation marks.
- Not enterprise-grey utility software.
- Not a growth-hacked funnel; the marketing reads like a publication, and we
  run no analytics or hype mechanics.
- Not a memory product that brags about how much it remembers. Creed brags,
  quietly, about how little it keeps and how true that little stays.

## What only the maintainer can confirm

This file reads the brand from what ships (name, copy, imagery, type). The
deeper origin, what the full-bleed scenery imagery is meant to evoke (it has
moved away from the earlier apostles/sermon, liturgical direction), and how far
any of that resonance should still carry, is the maintainer's call. If that
intent is stated, capture it here so future agents stop inferring it.
