"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation"; 
export default function Signup(){
    const router=useRouter();
      const [role, setRole] = useState<"reader" | "author">("reader");
      const handleLogin = () => {
    // 2. Logic to redirect based on the role
    if (role === "reader") {
      router.push("/readerDashboard"); // Go to reader dashboard
    } else {
      router.push("/author/dashboard"); // Go to author dashboard
    }
  };
    return(
        <div className="flex flex-col font-sans min-h-screen bg-gray-100 items-center justify-center  text-gray-800 ">
            <button 
            
            className=" rounded-3xl p-2 mb-4 absolute top-16 bg-gray-100 left-4 flex items-center gap-2 ">
                <Image src="/back.png" alt="Back" width={20} height={20}/>
               </button>
            <div className="border border-gray-200 bg-gray-50 shadow-2xl p-12 rounded-lg w-[100%] max-w-md ">
            <h2 className="font-bold ">Welcome Back</h2>
            <p className="mt-3">sign in to continue your reading journey</p>
            <p>i'm a </p>
            <div className="flex items-center justify-center gap-12 mt-2">
            <button className={`border rounded-lg border-gray-200 p-5  ${role === "reader" 
              ? "border-blue-600 bg-blue-50 text-blue-600 ring-2 ring-blue-600" 
              : "border-gray-200 bg-white text-gray-600"}`}
            onClick={() => setRole("reader")}
            >
              <Image src="/reader.png" alt="Reader" width={30} height={30} />
                Reader</button>
            <button className={`border rounded-lg border-gray-200 p-5 ${role === "author" 
              ? "border-blue-600 bg-blue-50 text-blue-600 ring-2 ring-blue-600" 
              : "border-gray-200 bg-white text-gray-600"}`}
            onClick={() => setRole("author")}
            >
              <Image src="/authors.png" alt="Author" width={30} height={30} /> Author</button>
        </div>
        <div className="flex flex-col gap-2 mt-4">
        <label htmlFor="">Email Address</label>
        <input type="email" placeholder="Enter your email address" className="border border-gray-200 p-1 px-3 rounded-xl"/>
        <label htmlFor="">Password</label>
        <input type="password" placeholder="Create a password" className="border border-gray-200 p-1 px-3 rounded-xl"/>
        <button 
        onClick={handleLogin}
        className="rounded-lg bg-blue-500 text-white p-1 w-32 mt-3 mx-auto">
                      Sign In
</button>
        <p className="mx-auto mt-1">Don't have an account? <a href="/signup" className="hover:text-blue-500">Sign-up</a></p>
        </div>
        </div>
        </div>
    )
}