"use client";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/AuthStore";

export default function Navbar() {
  const {isAuthenticated, logOut}=useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false)
useEffect(()=>{
  const handleResize = () => {
    if(window.innerWidth >= 500){
      setIsMenuOpen(false);
    }
  }
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
})
  return (
    <>
    {!isMenuOpen && (
 <header className="w-full sticky top-0 z-50 h-16 bg-gray-50 border border-gray-200 text-black flex items-center px-4">
           <Image 
          src="/logo1.png" 
          alt="BookNest Logo" 
          width={70}
          height={32}
          className="h-20 w-auto"
          priority
                />
    <nav className="hidden md:flex items-center gap-3 right-5 absolute">
        <Link href="/" className="hover:text-blue-600 hover:underline">Home</Link>
        <Link href="/about" className="hover:text-blue-600 hover:underline">About</Link>
        <Link href="/books" className="hover:text-blue-600 hover:underline">Books</Link>
        <Link href="/contact" className="hover:text-blue-600 hover:underline">Contact</Link>
        {!isAuthenticated ?(
        <Link href="/signup"><Button  className=" bg-blue-500 text-white ">Sign Up</Button></Link>
        ):(
          <Button onClick={logOut} variant="destructive">Logout</Button>
        )}
      </nav>
      <Button className="md:hidden absolute right-5 bg-blue-600 hover:bg-blue-700" onClick={()=>setIsMenuOpen(true)}><Menu/></Button>
    </header>
    )}
    {isMenuOpen && (
<header className="shadow-md bg-white/80 backdrop-blur-sm  fixed top-0 left-0 z-50 w-full">
        <Button
            className="bg-blue-600 hover:bg-blue-700 absolute right-5 top-5 self-center"
            onClick={() => setIsMenuOpen(false)}
          >
            <X size={30} />
          </Button>
          <nav className="flex flex-col gap-3 p-10">
        <Link href="/" className="hover:text-blue-600 hover:underline">Home</Link>
        <Link href="/about" className="hover:text-blue-600 hover:underline">About</Link>
        <Link href="/books" className="hover:text-blue-600 hover:underline">Books</Link>
        <Link href="/contact" className="hover:text-blue-600 hover:underline">Contact</Link>
      
{!isAuthenticated ?(
        <Link href="/signup"><Button  className=" bg-blue-500 text-white ">Sign Up</Button></Link>
        ):(
          <Button onClick={logOut} variant="destructive" className="w-fit">Logout</Button>
        )}
      </nav>
      </header>
    )}
    </>
  );
}
