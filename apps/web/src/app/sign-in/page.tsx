import { Activity, Truck } from "lucide-react";
import { SignInForm } from "@/components/sign-in-form";

export default function SignInPage() {
  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand">
          <span className="brand-mark">
            <Truck size={18} />
          </span>
          DeliveryOS
        </div>
        <div className="login-copy">
          <p className="eyebrow" style={{ color: "#57d49b" }}>
            Real-time delivery operations
          </p>
          <h1>
            Every delivery.
            <br />
            One clear picture.
          </h1>
          <p>
            Dispatch work, follow your fleet, detect risk early, and reconstruct
            every operational decision.
          </p>
        </div>
        <div
          style={{
            color: "#86a095",
            fontSize: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Activity size={13} color="#35b77d" /> Live operational telemetry
        </div>
      </section>
      <section className="login-form-wrap">
        <SignInForm />
      </section>
    </main>
  );
}
