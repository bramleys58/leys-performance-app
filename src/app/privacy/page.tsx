import Link from "next/link";
import { BUSINESS } from "@/lib/business-info";

export const metadata = { title: "Privacy | Leys Performance" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold">{children}</h2>;

/** The privacy notice. Public, so people can read it before they have a login. */
export default function PrivacyPage() {
  const id = [BUSINESS.owner, BUSINESS.enterpriseNumber && `enterprise number ${BUSINESS.enterpriseNumber}`, BUSINESS.address].filter(Boolean).join(", ");
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 leading-relaxed">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent">LEYS PERFORMANCE</p>
      <h1 className="mt-3 text-3xl font-bold">Privacy notice</h1>
      <p className="mt-2 text-sm text-muted">Last updated {BUSINESS.noticeUpdated}</p>

      <p className="mt-6">
        This app is how {BUSINESS.tradeName} coaches you: your program, the weights you log and how you are doing. This page explains in plain words what is stored, why, who sees it and what you can ask.
      </p>

      <H>Who is responsible</H>
      <p className="mt-2">
        {BUSINESS.tradeName}, run by {id}. Questions or requests: <a className="text-accent underline" href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
      </p>

      <H>What is stored</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your name, email address and login.</li>
        <li>Your training: programs, logged sets and reps, workout times, comments and your coach&apos;s replies.</li>
        <li>Test results and working maxes.</li>
        <li>Bodyweight, if you log it.</li>
        <li>Check-ins, if you fill them in: sleep, energy, soreness, stress, mood, pain and how your week went.</li>
        <li>Notes your coach keeps about injuries or pain, so training can be adjusted safely.</li>
        <li>For paying clients: what you bought and whether it is paid. Only your coach sees this.</li>
      </ul>
      <p className="mt-2">Nothing else. No location, no contacts, no tracking or advertising cookies. The app only uses a cookie to keep you logged in.</p>

      <H>Why, and on what basis</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <b>To coach you.</b> Your account and training data are needed to deliver the coaching you signed up for.
        </li>
        <li>
          <b>With your explicit consent.</b> Bodyweight, check-ins, pain and injury notes say something about your health. They are only stored because you agree to it in the app. You can withdraw that consent at any time by email; your coach then stops using and deletes that part.
        </li>
        <li>
          <b>Because the law requires it.</b> Payment records are kept as long as Belgian accounting rules require.
        </li>
      </ul>

      <H>Who can see it</H>
      <p className="mt-2">Only you and your coach. Other athletes never see your data. Nothing is sold or shared for marketing.</p>
      <p className="mt-2">These companies run parts of the app for us and only handle data on our instructions:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Supabase: database and logins, stored on servers in the EU (Paris).</li>
        <li>Vercel: runs the app, in the EU (Paris). Vercel is a US company and uses the EU standard contractual clauses.</li>
        <li>Resend: sends login and invite emails, from the EU (Ireland).</li>
        <li>OVHcloud: domain name and email inbox, in the EU.</li>
      </ul>

      <H>How long</H>
      <p className="mt-2">
        As long as you train with {BUSINESS.tradeName}. When you stop, your data is deleted within 12 months, sooner if you ask. Payment records are the exception, see above.
      </p>

      <H>Your rights</H>
      <p className="mt-2">You can ask to see your data, get a copy, have it corrected or deleted, and withdraw your consent. Email {BUSINESS.email} and you get an answer within a month.</p>
      <p className="mt-2">
        Not happy with how your data is handled? You can complain to the Belgian Data Protection Authority (
        <a className="text-accent underline" href="https://www.dataprotectionauthority.be" rel="noopener">
          dataprotectionauthority.be
        </a>
        ).
      </p>

      <H>Young athletes</H>
      <p className="mt-2">Athletes under 16 use the app together with a parent or guardian, who agrees to this notice with them.</p>

      <H>Changes</H>
      <p className="mt-2">When this notice changes in a way that matters, you are asked to read and agree again in the app.</p>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-accent underline">
          Back to the app
        </Link>
      </p>
    </main>
  );
}
