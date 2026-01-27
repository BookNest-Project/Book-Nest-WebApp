import { Button } from "../components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
<div className="flex flex-col md:flex-row justify-between items-center w-full p-5">
  <div className="flex flex-col md:w-1/2 space-y-6 self-start md:self-center">
    <h1 className="text-4xl font-bold">BookNest Reading Community</h1>
    <p className="text-xl text-gray-800">Discover, Share and Shop Books Together</p>
    <Link href='/login'><Button className="bg-blue-600 hover:bg-blue-700 w-fit hover:cursor-pointer mb-5">Get Started<ArrowRight/></Button></Link>
  </div>
        <Image width={400} height={300} src='https://plus.unsplash.com/premium_photo-1677187301535-b46cec7b2cc8?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MzN8fGJvb2tzfGVufDB8fDB8fHww' alt="image" className='w-full md:w-1/2'/>
</div>  
);
}
