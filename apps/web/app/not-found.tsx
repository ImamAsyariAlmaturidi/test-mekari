import Link from "next/link";

export default function NotFound() {
  return <section className="panel mx-auto mt-12 max-w-xl p-8 text-center">
    <p className="section-kicker">404</p>
    <h1 className="text-lg font-semibold">Page not found</h1>
    <p className="my-3 text-sm text-slate-600">The page you requested does not exist.</p>
    <Link className="text-sm font-medium text-accent underline underline-offset-4" href="/">Return to playground</Link>
  </section>;
}
