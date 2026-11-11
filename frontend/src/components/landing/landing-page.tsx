"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { LogoMark } from "@/components/shell/logo-mark";
import { faceModeForSection, INTRO_FEATURES, LANDING_SCENARIOS, LANDING_SECTIONS, type LandingSection } from "@/lib/landing/content";
import { cn } from "@/lib/utils";
import { ColumnGuides, LandingFooter, LandingNav, PaperGrid, SectionRail } from "./landing-chrome";
import { EYEBROW, PAPER, SplitHeadline, usePrefersReducedMotion } from "./landing-primitives";
import { PipelineCarousel } from "./pipeline-carousel";
import { PromptBox } from "./prompt-box";
import { ScenarioSwitcher } from "./scenario-switcher";

/** three.js is only downloaded for /welcome, and only in the browser. */
const SentinelScene = dynamic(() => import("./sentinel-scene"), { ssr: false, loading: () => null });

/**
 * Text columns from 901 px up stop at half the viewport, so they never reach the robot, which the camera
 * frames in the other half (lib/landing/camera-states.ts). At 900 px and below the robot sits above.
 */
const LEFT_COLUMN = "min-[901px]:max-w-[min(44rem,calc(50vw-2.5rem))]";
const LEFT_COLUMN_NARROWER = "min-[901px]:max-w-[min(40rem,calc(50vw-2.5rem))]";

/** Reveal timing for the intro: eyebrow, headline boxes, sub line, prompt, features, each a beat apart. */
function reveal(step: number) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: 0.15 + step * 0.12, ease: [0.16, 1, 0.3, 1] as const },
  };
}

const inView = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
};

/**
 * Public landing page (no admin key). The robot is decorative and aria-hidden; every meaning lives in this
 * HTML. Sections carry `data-landing-section`, which the scene reads to drive its camera from scroll.
 */
export function LandingPage() {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState<LandingSection>("intro");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setSceneUnavailable(true), []);

  useEffect(() => {
    const sections = LANDING_SECTIONS.map((id) => document.getElementById(id)).filter((element): element is HTMLElement => !!element);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id as LandingSection);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const scenario = LANDING_SCENARIOS[scenarioIndex];
  const faceMode = faceModeForSection(active, scenario.decision);

  return (
    <div className="relative isolate min-h-svh bg-background text-foreground">
      <PaperGrid />
      {sceneUnavailable ? (
        <StaticFallback />
      ) : (
        <SentinelScene faceMode={faceMode} reducedMotion={reducedMotion} onUnavailable={onUnavailable} />
      )}
      <ColumnGuides />
      <LandingNav active={active} />
      <SectionRail active={active} />

      <main id="landing-stage" className="relative z-10">
        {/* 1. Intro */}
        <section
          id="intro"
          data-landing-section
          aria-labelledby="intro-heading"
          className="relative mx-auto flex min-h-svh max-w-[1440px] scroll-mt-14 flex-col justify-center px-6 pt-24 pb-20 md:px-10 max-[900px]:justify-start max-[900px]:pt-[44svh]"
        >
          <div className={cn("flex flex-col gap-6", LEFT_COLUMN)}>
            <motion.p className={cn(EYEBROW, PAPER)} {...reveal(0)}>
              For AI agents
            </motion.p>
            <SplitHeadline
              as="h1"
              id="intro-heading"
              size="intro"
              first="Runtime"
              second="Security"
              outlineSecond
              renderLine={(line, index) => (
                <motion.span key={index} {...reveal(1 + index)}>
                  {line}
                </motion.span>
              )}
            />
            <motion.p {...reveal(3)} className={cn("max-w-md text-lg leading-relaxed text-muted-foreground", PAPER)}>
              Every tool call your AI agent makes passes a checkpoint first.
            </motion.p>
            <motion.div {...reveal(4)} className="max-w-xl">
              <PromptBox reducedMotion={reducedMotion} />
            </motion.div>
            <motion.ul
              {...reveal(5)}
              aria-label="What each request passes"
              className={cn("flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[0.6875rem] tracking-[0.12em]", PAPER)}
            >
              {INTRO_FEATURES.map((feature, index) => (
                <li key={feature.label} className={cn("flex items-center gap-3", feature.dim ? "text-muted-foreground/70" : "text-foreground")}>
                  {index > 0 && !feature.dim ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
                  {feature.label}
                </li>
              ))}
            </motion.ul>
          </div>

          <a
            href="#product"
            className="absolute right-6 bottom-8 flex items-center gap-2 rounded-md font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-[900px]:hidden md:right-10 min-[1200px]:right-28"
          >
            Scroll
            <ArrowDown aria-hidden="true" className="size-3.5" />
            <span className="sr-only">to the product section</span>
          </a>
        </section>

        {/* 2. Product */}
        <section
          id="product"
          data-landing-section
          aria-labelledby="product-heading"
          className="mx-auto flex min-h-[120svh] max-w-[1440px] scroll-mt-14 flex-col justify-center px-6 py-24 md:px-10 max-[900px]:justify-start max-[900px]:pt-[34svh]"
        >
          <div className={cn("flex flex-col gap-8", LEFT_COLUMN_NARROWER)}>
            <motion.div {...inView} className="flex flex-col gap-4">
              <p className={cn(EYEBROW, PAPER)}>The pipeline</p>
              <SplitHeadline id="product-heading" size="section" first="A checkpoint" second="for every tool call" />
              <p className={cn("max-w-md text-base leading-relaxed text-muted-foreground", PAPER)}>
                The agent sends what it wants to do before it does it. AgentShield checks the request in a fixed order, and the
                first stage that says no decides.
              </p>
            </motion.div>
            <PipelineCarousel active={active === "product"} reducedMotion={reducedMotion} />
          </div>
        </section>

        {/* 3. Scenarios */}
        <section
          id="scenarios"
          data-landing-section
          aria-labelledby="scenarios-heading"
          className="mx-auto grid min-h-[120svh] max-w-[1440px] scroll-mt-14 grid-cols-1 items-center px-6 py-24 md:px-10 max-[900px]:items-start max-[900px]:pt-[44svh] min-[901px]:grid-cols-12"
        >
          <div className="flex flex-col gap-8 min-[901px]:col-span-6 min-[901px]:col-start-7">
            <motion.div {...inView} className="flex flex-col gap-4">
              <p className={cn(EYEBROW, PAPER)}>Scenarios</p>
              <SplitHeadline id="scenarios-heading" size="section" first="Real runs" second="real verdicts" />
              <p className={cn("max-w-md text-base leading-relaxed text-muted-foreground", PAPER)}>
                The agent simulator&apos;s pipelines and the trajectory demo, with the outcome each one is documented to get.
                The robot&apos;s face shows the same verdict.
              </p>
            </motion.div>
            <ScenarioSwitcher index={scenarioIndex} onChange={setScenarioIndex} />
            <p className={cn("text-xs leading-relaxed text-muted-foreground", PAPER)}>
              Outcomes as documented in <span className="font-mono">simulator/README.md</span> and{" "}
              <span className="font-mono">docs/demo-guide.md</span> for the demo grants. Grants and the Risk Engine can change
              a final decision, so a live run is the authority.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

/** Shown when WebGL cannot start: the logo mark, large and quiet, where the robot would stand. */
function StaticFallback() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center min-[901px]:justify-end min-[901px]:pr-[12vw]">
      <LogoMark className="size-[min(70vw,30rem)] text-primary opacity-25" />
    </div>
  );
}
