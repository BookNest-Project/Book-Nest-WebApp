"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/AuthStore";

const Login = () => {
  const router = useRouter();
  const { setAuth } = useAuthStore(); 

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Something went wrong");
      }

      const token = data.token || data.accessToken;
      const user = data.user || data;

      if (!token || !user?.role) {
        throw new Error("Invalid response from server – missing token or role");
      }

      setAuth({ token, user });

      if (user.role === "author") {
        router.push("/authorHome");
      } else {
        router.push("/readerDashboard");
      }

    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col p-5 rounded-xl shadow-2xl md:w-1/3 w-full my-10 mx-auto">
      <h3 className="font-bold text-lg">Welcome Back</h3>
      <h5>Sign in to continue your reading journey</h5>
      
      <form onSubmit={handleSubmit} className="flex flex-col space-y-3 my-5">
      <p>Email</p>
      <Input type="email" placeholder="Enter your email" value={email} onChange={(e)=>setEmail(e.target.value)}/>
      <p>Password</p>
      <Input type="password" placeholder="Enter your password" value={password} onChange={(e)=>setPassword(e.target.value)}/>
              {error && <p className="text-red-600 text-sm">{error}</p>}
      <Button           disabled={loading}
 className="bg-blue-600 hover:bg-blue-700 text-white w-fit self-center">          {loading ? "Logging in..." : "Login"}
</Button>
    </form>
    <p className="self-center">Don&apos;t have an account? <Link href="/signup"  className="text-blue-600 hover:underline">Sign Up</Link></p>
    </div>
  )
}

export default Login