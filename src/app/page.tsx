import Link from "next/link";
import SerialForm from "@/components/SerialForm";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/roles";

export default async function Home() {
  const s = await getSession();
  return (
    <section className="hero">
      <h1>Where has this product really been?</h1>
      <p>Enter the serial number printed under the QR code. You will see every handover from the factory to the shelf, and whether anyone has altered the record.</p>
      <SerialForm />
      <p className="muted">
        {s ? <>Signed in as {s.name}. <Link href={homeFor(s.role)}>Open your workspace</Link></>
          : <>Work in the supply chain? <Link href="/login">Sign in</Link> or <Link href="/register">register your organization</Link>.</>}
      </p>
    </section>
  );
}
