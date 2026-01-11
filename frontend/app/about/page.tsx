
import { Button } from "../../components/ui/button";
import { Book, GitGraph, Music, Star } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

const About = () => {
  return (
    <div className='flex flex-col items-center '>
        <h2 className='text-3xl font-bold my-10'>About Us</h2>
      <div className="p-5 flex flex-col md:flex-row justify-between items-center w-full my-auto space-y-5">
 <p className="text-gray-800 ">Book Nest is a digital platform designed to bring readers together through a shared love of books while making buying, selling, and discovering books simple and accessible. Our mission is to build an interactive reading community where users can connect, share ideas, and explore books with ease. 
<br />Our vision is to become a trusted online space that combines social engagement .</p>
        <Image width={400} height={300} src='https://images.unsplash.com/photo-1610116306796-6fea9f4fae38?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Ym9va3N8ZW58MHx8MHx8fDA%3D' alt="image" className='object-cover w-full'/>
</div> 

    <h4 className='text-xl font-bold my-5'>Services</h4>
<div className='flex justify-around w-full py-5'>
    <div className='flex px-2 py-1 bg-gray-200 rounded-2xl'><Book/> PDF & eBooks</div>
    <div className='flex px-2 py-1 bg-gray-200 rounded-2xl'><Music/>Audio Books</div>
    <div className='flex px-2 py-1 bg-gray-200 rounded-2xl'><GitGraph/>Progress Tracking</div>
</div>

    <h4 className='text-xl font-bold my-5'>Features</h4>
    <p className='text-gray-800 mb-5'>Everything you need for a complete Reading experience</p>
    
    <div className='p-5 grid md:grid-cols-4 sm:grid-cols-2 grid-cols-1 gap-5'>
        <div className='border space-y-2 p-3 rounded-lg shadow-lg'>
        <Book className='bg-blue-100 p-1.5 w-10 h-10 rounded-lg text-blue-600'/>
        <h6 className='text-lg font-bold'>Digital book & PDFs</h6>
        <p>Read beautifully formatted PDFs with a distraction - free reader.Bookmarks, highlight,and take notes.</p>
    </div>
    
    <div className='border space-y-2 p-3 rounded-lg shadow-lg'>
        <Book className='bg-blue-100 p-1.5 w-10 h-10 rounded-lg text-blue-600'/>
        <h6 className='text-lg font-bold'>Digital book & PDFs</h6>
        <p>Read beautifully formatted PDFs with a distraction - free reader.Bookmarks, highlight,and take notes.</p>
    </div>
    <div className='border space-y-2 p-3 rounded-lg shadow-lg'>
        <Book className='bg-blue-100 p-1.5 w-10 h-10 rounded-lg text-blue-600'/>
        <h6 className='text-lg font-bold'>Digital book & PDFs</h6>
        <p>Read beautifully formatted PDFs with a distraction - free reader.Bookmarks, highlight,and take notes.</p>
    </div>

    <div className='border space-y-2 p-3 rounded-lg shadow-lg'>
        <Book className='bg-blue-100 p-1.5 w-10 h-10 rounded-lg text-blue-600'/>
        <h6 className='text-lg font-bold'>Digital book & PDFs</h6>
        <p>Read beautifully formatted PDFs with a distraction - free reader.Bookmarks, highlight,and take notes.</p>
    </div>
    
    </div>

        <h4 className='text-xl font-bold my-5'>Testimonials</h4>
    <p className='text-gray-800 mb-5'>Loved by Readers world wide</p>
<div className='p-5 grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-5'>
<div className='flex flex-col border bg-gray-50 shadow-lg rounded-2xl p-3 gap-2'>
    <div className='flex gap-3'>
<Image width={100} height={100} src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHByb2ZpbGV8ZW58MHx8MHx8fDA%3D" alt="profile" className='w-14 h-14 rounded-full'/>
<div className='flex flex-col gap-1'>
    <p className='text-semibold'>Nigist Sisay</p>
    <p>Graduate student</p>
    <div className='flex'><Star fill='yellow' size={20}/><Star fill='yellow' size={20}/><Star size={20}/><Star size={20}/><Star size={20}/></div>
</div>
    </div>
    <p>“booknest transformed my reading habit. the progress tracking keeps me motivated.and the clean interface make reading a joy” </p>
</div>

<div className='flex flex-col border bg-gray-50 shadow-lg rounded-2xl p-3 gap-2'>
    <div className='flex gap-3'>
<Image width={100} height={100} src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHByb2ZpbGV8ZW58MHx8MHx8fDA%3D" alt="profile" className='w-14 h-14 rounded-full'/>
<div className='flex flex-col gap-1'>
    <p className='text-semibold'>Nigist Sisay</p>
    <p>Graduate student</p>
    <div className='flex'><Star fill='yellow' size={20}/><Star fill='yellow' size={20}/><Star size={20}/><Star size={20}/><Star size={20}/></div>
</div>
    </div>
    <p>“booknest transformed my reading habit. the progress tracking keeps me motivated.and the clean interface make reading a joy” </p>
</div>

<div className='flex flex-col border bg-gray-50 shadow-lg rounded-2xl p-3 gap-2'>
    <div className='flex gap-3'>
<Image width={100} height={100} src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHByb2ZpbGV8ZW58MHx8MHx8fDA%3D" alt="profile" className='w-14 h-14 rounded-full'/>
<div className='flex flex-col gap-1'>
    <p className='text-semibold'>Nigist Sisay</p>
    <p>Graduate student</p>
    <div className='flex'><Star fill='yellow' size={20}/><Star fill='yellow' size={20}/><Star size={20}/><Star size={20}/><Star size={20}/></div>
</div>
    </div>
    <p>“booknest transformed my reading habit. the progress tracking keeps me motivated.and the clean interface make reading a joy” </p>
</div>
</div>

<div className='bg-blue-700 text-white w-full flex flex-col items-center justify-center py-16 gap-5'>
    <h1 className='text-3xl font-bold'>Start your reading journey today</h1>
    <p className='text-xl text-center text-gray-200'>In thousand of readers who have discovered a better way to learn . Get started for free and unlock your potential</p>
    <Link href='/auth/signup'><Button variant='outline' className='text-black'>Create account</Button></Link>
</div>
    </div>
  )
}

export default About
