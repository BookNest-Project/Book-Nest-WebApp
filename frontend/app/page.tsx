// import Image from "next/image";

// export default function Home() {
//   return (
//     <div style={{ backgroundColor: 'white' }} className="flex min-h-screen  text-black items-center font-sans dark:bg-black p-4">
//       <div className="flex flex-col items-center md:items-start text-black  md:text-left ml-24 mr-24">
//         <h1 className="text-3xl md:text-5xl font-bold mb-4">Book Nest - <br/>Reading Community</h1>
//         <h3 className="text-lg md:text-xl  dark:text-gray-300 mb-8">
//           The Social Network for Book Lovers
//         </h3>
//         <div className="flex gap-4">
//           <button className="rounded-3xl bg-white text-gray-800 shadow-xl font-medium p-3 px-8 hover:bg-gray-100 transition">
//             Explore Books
//           </button>
//           <button className="rounded-3xl bg-blue-800 text-white shadow-xl font-medium p-3 px-8 hover:bg-blue-900 transition">
//             Get Started
//           </button>
//         </div>
//       </div>
      
//       <div className="hidden md:block">
//         <Image
//           src="/bookhome.webp"
//           alt="Home Illustration"
//           width={600}
//           height={400}
//           priority
//           className="rounded-lg"
//         />
//       </div>
//     </div>
//   );
// }

import { Button } from "../components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

export default function Home() {
  return (
<div className="flex flex-col md:flex-row justify-between items-center w-full p-5">
  <div className="flex flex-col md:w-1/2 space-y-6 self-start md:self-center">
    <h1 className="text-4xl font-bold">BookNest Reading Community</h1>
    <p className="text-xl text-gray-800">Discover, Share and Shop Books Together</p>
    <Button className="bg-blue-600 hover:bg-blue-700 w-fit hover:cursor-pointer mb-5">Get Started<ArrowRight/></Button>
  </div>
        <Image width={400} height={300} src='https://plus.unsplash.com/premium_photo-1677187301535-b46cec7b2cc8?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MzN8fGJvb2tzfGVufDB8fDB8fHww' alt="image" className='w-full md:w-1/2'/>
</div>  
);
}
