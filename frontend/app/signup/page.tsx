"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BookIcon, PenTool } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"

const Signup = () => {
  const router = useRouter()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"reader" | "author">("reader")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: fullName,
          email,
          password,
          role,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || "Something went wrong")
      }

      // optional: save token if backend returns one
      // localStorage.setItem("token", data.token)

      router.push("/login")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col p-5 rounded-xl shadow-2xl md:w-1/3 my-10 mx-auto">
      <h3 className="font-bold text-lg">Create Account</h3>
      <h5>Join our community of readers and authors</h5>

      <p className="mt-4">I&apos;m a:</p>
      <div className="flex justify-around gap-4">
        <Button
          onClick={() => setRole("reader")}
          variant='ghost'
          className={`border p-5 rounded-xl flex flex-col items-center w-1/3 h-20 ${
            role === "reader" ? "border-blue-600" : ""
          }`}
        >
          <BookIcon />
          <p>Reader</p>
        </Button>

        <Button
          onClick={() => setRole("author")}
          variant='ghost'
          className={`border p-5 rounded-xl flex flex-col items-center w-1/3 h-20 ${
            role === "author" ? "border-blue-600" : ""
          }`}
        >
          <PenTool />
          <p>Author</p>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col space-y-3 my-5">
        <p>Full Name</p>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your name"
          required
        />

        <p>Email</p>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
        />

        <p>Password</p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <Button
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white w-fit self-center"
        >
          {loading ? "Creating..." : "Create Account"}
        </Button>
      </form>

      <p className="self-center">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Login
        </Link>
      </p>
    </div>
  )
}

export default Signup
