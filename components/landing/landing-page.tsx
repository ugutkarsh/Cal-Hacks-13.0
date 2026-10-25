"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin, Users, Sparkles, ArrowRight, Mail, MapPinned } from "lucide-react";
import { AuthPanel } from "@/components/profile/auth-panel";
import { Button } from "@/components/ui/button";

/** Full-bleed trail / outdoor sports photo — spans the entire landing page. */
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=2400&q=80";
const HERO_ALT =
  "Hikers on a mountain ridge at golden hour — outdoor activity atmosphere";

const CONTACT_EMAIL = "a_nataraja@u.pacific.edu";
const CONTACT_LOCATION = "San Francisco, CA · Cal Hacks 13.0";

export function LandingPage() {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");

  function openAuth(mode: "sign-in" | "sign-up") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  function goToMap() {
    router.push("/discover");
  }

  return (
    <div className="relative min-h-dvh text-white">
      {/* Page-wide background photo — fixed so it stays through the whole scroll */}
      <div className="fixed inset-0 z-0 landing-hero-media" aria-hidden>
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_35%] landing-hero-photo"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-[var(--brand-deep)]/55 to-[var(--brand-deep)]/80" />
        <div
          className="pointer-events-none absolute -right-16 top-24 h-72 w-72 rounded-full bg-[var(--brand-mist)]/15 blur-3xl landing-orb"
        />
        <div
          className="pointer-events-none absolute bottom-[20%] left-[-4rem] h-56 w-56 rounded-full bg-[var(--marker-event)]/20 blur-3xl landing-orb-delayed"
        />
      </div>

      <div className="relative z-10">
        <header className="absolute inset-x-0 top-0 z-40">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
            <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white sm:text-2xl">
              Trailmap
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/15 hover:text-white"
                onClick={() => openAuth("sign-in")}
              >
                Sign in
              </Button>
              <Button
                type="button"
                className="bg-white text-[var(--brand-deep)] hover:bg-white/90"
                onClick={() => openAuth("sign-up")}
              >
                Register
              </Button>
            </div>
          </div>
        </header>

        {/* Hero — brand-first first viewport */}
        <section className="relative flex min-h-dvh flex-col justify-end overflow-hidden px-5 pb-16 pt-28 sm:px-8 sm:pb-24">
          <div className="relative z-10 mx-auto w-full max-w-6xl landing-hero-copy">
            <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.95] tracking-tight text-white sm:text-7xl md:text-8xl">
              Trailmap
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85 sm:text-xl">
              Find places, pickup games, and people near you — then show up
              together.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                className="bg-white text-[var(--brand-deep)] hover:bg-white/90"
                onClick={() => openAuth("sign-up")}
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={goToMap}
              >
                Browse the map
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Map-first activity discovery
          </h2>
          <p className="mt-3 max-w-2xl text-white/75">
            Trailmap pulls real local events onto a living map, ranks what fits
            your schedule and budget, and lets you opt into meeting people nearby
            — without pretending anyone&apos;s live GPS is on the pin.
          </p>
        </section>

        <section className="border-y border-white/15 bg-black/25 backdrop-blur-[2px]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 md:grid-cols-3 md:gap-10">
            <Feature
              icon={MapPin}
              title="Places & events"
              body="Imported Meetup, Eventbrite, races, and studios land as real markers — with honest cost when the listing says a fee."
            />
            <Feature
              icon={Sparkles}
              title="For You ranking"
              body="Preferences for distance, budget, days, and interests power a content-based recommender over the same Supabase catalog."
            />
            <Feature
              icon={Users}
              title="People, when you opt in"
              body="Create a profile, set an approximate city pin, and appear on the People layer. Exact home location stays off the map."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Built for showing up locally
          </h2>
          <p className="mt-3 max-w-2xl text-white/75">
            Prefer a hike Saturday morning, a badminton court under $25, or a
            beginner-friendly run club? Set it once — Trailmap keeps the map and
            For You list honest about what matches.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button
              type="button"
              size="lg"
              className="bg-white text-[var(--brand-deep)] hover:bg-white/90"
              onClick={() => openAuth("sign-up")}
            >
              Create your profile
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => openAuth("sign-in")}
            >
              Sign in to continue
            </Button>
          </div>
        </section>

        <footer className="border-t border-white/15 bg-black/30 backdrop-blur-[2px]">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Contact
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/75 sm:text-base">
              Questions, partnerships, or feedback on Trailmap — we&apos;d love
              to hear from you.
            </p>
            <ul className="mt-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-10">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="group inline-flex items-start gap-3 text-white transition-colors hover:text-white"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                    <Mail className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-white/55">
                      Email
                    </span>
                    <span className="mt-0.5 block text-sm font-medium underline-offset-4 group-hover:underline sm:text-base">
                      {CONTACT_EMAIL}
                    </span>
                  </span>
                </a>
              </li>
              <li className="inline-flex items-start gap-3 text-white">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                  <MapPinned className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wide text-white/55">
                    Location
                  </span>
                  <span className="mt-0.5 block text-sm font-medium sm:text-base">
                    {CONTACT_LOCATION}
                  </span>
                </span>
              </li>
            </ul>
            <p className="mt-12 text-xs text-white/50">
              <span className="sr-only">{HERO_ALT}</span>
              Trailmap · Cal Hacks · Map discovery over live Supabase data
            </p>
          </div>
        </footer>
      </div>

      <AuthPanel
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => {
          setAuthOpen(false);
          goToMap();
        }}
      />
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MapPin;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="mt-4 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/75">{body}</p>
    </div>
  );
}
