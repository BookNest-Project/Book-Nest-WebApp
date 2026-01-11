import Image from "next/image";
export default function Signup(){
    return(
        <div className="flex flex-col font-sans min-h-screen bg-gray-100 items-center justify-center  text-gray-800 ">
            <button className=" rounded-3xl p-2 mb-4 absolute top-16 bg-gray-100 left-4 flex items-center gap-2 ">
                <Image src="/back.png" alt="Back" width={20} height={20}/>
               </button>
            <div className="border border-gray-200 bg-gray-50 shadow-2xl p-12 rounded-lg w-[100%] max-w-md ">
            <h2 className="font-bold ">Create Account </h2>
            <p className="mt-3">join our community of readers and authors</p>
            <p>i'm a </p>
            <div className="flex items-center justify-center gap-12 mt-2">
            <button className="border rounded-lg border-gray-200 p-5 ">
              <Image src="/reader.png" alt="Reader" width={30} height={30} />
                Reader</button>
            <button className="border rounded-lg border-gray-200 p-5 "><Image src="/authors.png" alt="Author" width={30} height={30} /> Author</button>
        </div>
        <div className="flex flex-col gap-2 mt-4">
        <label htmlFor="">Full Name</label>
        <input type="text" placeholder="Enter your full name"className="border border-gray-200 p-1 px-3 rounded-xl"/>
        <label htmlFor="">Email Address</label>
        <input type="email" placeholder="Enter your email address" className="border border-gray-200 p-1 px-3 rounded-xl"/>
        <label htmlFor="">Password</label>
        <input type="password" placeholder="Create a password" className="border border-gray-200 p-1 px-3 rounded-xl"/>
        <button className="rounded-lg bg-blue-500 text-white p-1 w-32 mx-auto">Create Account</button>
        <p className="mx-auto mt-1">Already have an account? <a href="/login" className="hover:text-blue-500">Login</a></p>
        </div>
        </div>
        </div>
    )
}