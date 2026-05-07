// Shared name pool + masking helper used by the synthetic winners feed
// (dailyWinnersService) and the live activity feed (activityService).
// Keeping a single source of truth means the two feeds feel consistent
// (you see "Rahul S." in both, not "Rahul S." in winners and "CryptoKing"
// in activities).
//
// Pools are biased toward common Indian names but cover north/south/east/
// west and modern given names so the feed doesn't repeat. Total combinations:
// ~180 firsts × ~80 lasts ≈ 14,500 unique pairs; after the privacy-style
// mask the realistic distinct surface is plenty for daily volume.

const FIRST_NAMES = [
  // Common Indian male
  'Aarav', 'Aaryan', 'Abhinav', 'Abhishek', 'Aditya', 'Ajay', 'Akash', 'Akhil',
  'Amit', 'Anand', 'Aniket', 'Anil', 'Ankit', 'Anuj', 'Arjun', 'Arnav',
  'Ashish', 'Ayush', 'Bhavesh', 'Chetan', 'Daksh', 'Darshan', 'Deepak', 'Dev',
  'Devansh', 'Dhruv', 'Gaurav', 'Harish', 'Harsh', 'Hemant', 'Hitesh',
  'Ishaan', 'Jai', 'Jatin', 'Karan', 'Karthik', 'Kartik', 'Keshav', 'Kishore',
  'Krish', 'Krishna', 'Kunal', 'Lakshay', 'Madhav', 'Manish', 'Manoj', 'Mayank',
  'Mihir', 'Mohit', 'Naveen', 'Neeraj', 'Nikhil', 'Nilesh', 'Nirav', 'Om',
  'Parth', 'Piyush', 'Prakash', 'Pranav', 'Prateek', 'Prem', 'Pulkit', 'Rahul',
  'Raj', 'Rajat', 'Rajesh', 'Rakesh', 'Ravi', 'Rishabh', 'Rohan', 'Rohit',
  'Sachin', 'Sahil', 'Samar', 'Sandeep', 'Sanjay', 'Sarthak', 'Saurabh', 'Shivam',
  'Shubham', 'Siddharth', 'Sumit', 'Suraj', 'Suresh', 'Tarun', 'Tushar', 'Uday',
  'Varun', 'Vedant', 'Vihaan', 'Vikas', 'Vikram', 'Vinay', 'Vipin', 'Vishal',
  'Vivek', 'Yash', 'Yogesh',
  // Common Indian female
  'Aanya', 'Aarti', 'Aditi', 'Aishwarya', 'Akanksha', 'Alia', 'Ananya', 'Anjali',
  'Anushka', 'Aparna', 'Asha', 'Avni', 'Bhavna', 'Chitra', 'Deepika', 'Diksha',
  'Divya', 'Ekta', 'Garima', 'Gauri', 'Geeta', 'Hema', 'Isha', 'Ishika',
  'Jaya', 'Jyoti', 'Kavya', 'Khushi', 'Kiara', 'Kirti', 'Komal', 'Kriti',
  'Lakshmi', 'Madhuri', 'Mahima', 'Mansi', 'Maya', 'Meera', 'Mira', 'Mishti',
  'Mona', 'Naina', 'Namrata', 'Nandini', 'Neha', 'Nikita', 'Nisha', 'Nitya',
  'Pallavi', 'Payal', 'Pooja', 'Prachi', 'Prerna', 'Priya', 'Priyanka', 'Radha',
  'Rashmi', 'Renu', 'Riya', 'Ruchi', 'Saanvi', 'Sakshi', 'Sanya', 'Shalini',
  'Shanaya', 'Shreya', 'Shweta', 'Simran', 'Smita', 'Sneha', 'Sonal', 'Sonia',
  'Suhana', 'Sunita', 'Swati', 'Tanya', 'Tara', 'Tina', 'Trisha', 'Vaishnavi',
  'Vidya', 'Yamini', 'Zoya',
];

const LAST_NAMES = [
  // North / Hindi belt
  'Agarwal', 'Aggarwal', 'Ahuja', 'Bansal', 'Bhatt', 'Bhardwaj', 'Bhatia', 'Chauhan',
  'Chopra', 'Dixit', 'Dubey', 'Gandhi', 'Garg', 'Goel', 'Gupta', 'Jain',
  'Jha', 'Joshi', 'Kapoor', 'Kaur', 'Khanna', 'Khurana', 'Kohli', 'Kumar',
  'Malhotra', 'Mehra', 'Mehta', 'Mishra', 'Mittal', 'Nanda', 'Pandey', 'Saxena',
  'Sehgal', 'Sethi', 'Sharma', 'Singh', 'Singhal', 'Sinha', 'Tandon', 'Thakur',
  'Tiwari', 'Verma', 'Vij', 'Yadav',
  // South
  'Iyer', 'Iyengar', 'Krishnan', 'Menon', 'Murthy', 'Naidu', 'Nair', 'Pillai',
  'Prasad', 'Raman', 'Rao', 'Reddy', 'Sastry', 'Shetty',
  // West
  'Desai', 'Modi', 'Parekh', 'Patel', 'Patil', 'Shah', 'Trivedi',
  // East
  'Banerjee', 'Basu', 'Bose', 'Chakraborty', 'Chatterjee', 'Das', 'Dutta', 'Ghosh',
  'Mukherjee', 'Sen',
  // Common Muslim
  'Ahmed', 'Ali', 'Hussain', 'Khan', 'Sheikh', 'Siddiqui',
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[rand(0, arr.length - 1)];
}

// Render a privacy-style display name. Cycles through a few styles so the
// feed doesn't look like every winner is "Rahul S." over and over. Pass an
// explicit `style` for deterministic output, or omit to randomise.
function maskName(first, last, style) {
  const l0 = (last && last[0]) || '';
  const f0 = (first && first[0]) || '';
  // ~10% chance of full name when randomised; otherwise alternate masks.
  const s = style != null ? style : (rand(0, 9) === 0 ? 2 : rand(0, 1));
  switch (s % 3) {
    case 0: return `${first} ${l0}.`;       // Rahul S.
    case 1: return `${f0}. ${last}`;        // R. Sharma
    case 2: return `${first} ${last}`;      // Rahul Sharma
    default: return `${first} ${l0}.`;
  }
}

// One-shot helper: build a random masked display name in one call.
function randomMaskedName(style) {
  return maskName(randomChoice(FIRST_NAMES), randomChoice(LAST_NAMES), style);
}

module.exports = {
  FIRST_NAMES,
  LAST_NAMES,
  rand,
  randomChoice,
  maskName,
  randomMaskedName,
};
