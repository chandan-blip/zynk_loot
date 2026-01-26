import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiChevronRight,
  FiChevronLeft,
  FiZap,
  FiShoppingCart,
  FiHeart,
  FiAward,
} from "react-icons/fi";
import { GiTwoCoins, GiTrophy } from "react-icons/gi";

const ONBOARDING_KEY = "loot_onboarding_completed";

const steps = [
  {
    id: 1,
    title: "Welcome to Loot!",
    subtitle: "Your chance to win big",
    description:
      "Loot is a lottery platform where you can buy 7-digit numbers, vote for your favorites, and win prizes when your numbers match the revealed winning number.",
    icon: GiTwoCoins,
    iconBg: "bg-accent/20",
    iconColor: "text-accent",
    tips: [
      "Buy numbers to participate in draws",
      "Each draw reveals digits one by one",
      "Match more digits to win bigger prizes",
    ],
  },
  {
    id: 2,
    title: "How Draws Work",
    subtitle: "7 digits, 7 chances to win",
    description:
      "Every draw reveals a winning 7-digit number one digit at a time. The more digits your number matches from left to right, the bigger your prize!",
    icon: FiZap,
    iconBg: "bg-purple/20",
    iconColor: "text-purple-light",
    tips: [
      "Digits are revealed hourly during active sessions",
      "Match 6 digits to share 10% of the prize pool",
      "Match all 7 digits to win the JACKPOT (80%)!",
    ],
  },
  {
    id: 3,
    title: "Buy Numbers",
    subtitle: "Pick your lucky numbers",
    description:
      "Search for any 7-digit number and buy it to enter the current or upcoming draw. Each number can only have one owner per draw.",
    icon: FiShoppingCart,
    iconBg: "bg-emerald/20",
    iconColor: "text-emerald-light",
    tips: [
      "Search any 7-digit number to buy it",
      "Virtual numbers (not yet owned) show a buy button",
      "Your purchased numbers appear with a gold border",
    ],
  },
  {
    id: 4,
    title: "Vote & Support",
    subtitle: "Show love for numbers",
    description:
      "Vote for numbers you like! Voting helps the community discover popular numbers. You can vote even if you don't own the number.",
    icon: FiHeart,
    iconBg: "bg-pink-500/20",
    iconColor: "text-pink-400",
    tips: [
      "Click the heart icon to vote for a number",
      "Popular numbers appear higher in listings",
      "You can unvote anytime",
    ],
  },
  {
    id: 5,
    title: "Win Prizes",
    subtitle: "Cash out your winnings",
    description:
      "When your number matches revealed digits, you can cash out early or wait for more digits to be revealed for potentially bigger prizes!",
    icon: GiTrophy,
    iconBg: "bg-gold/20",
    iconColor: "text-gold-light",
    tips: [
      "Matching numbers show your current return",
      "Cash out anytime after matching starts",
      "Waiting longer can multiply your winnings",
    ],
  },
];

function OnboardingGuide({ onComplete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem(ONBOARDING_KEY);
    if (!hasCompleted) {
      // Small delay to let the page render first
      const timer = setTimeout(() => setIsOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setIsOpen(false);
    onComplete?.();
  };

  const handleSkip = (type) => {
    if (type) {
      localStorage.setItem(ONBOARDING_KEY, "true");
    }
    setIsOpen(false);
    onComplete?.();
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = steps[currentStep];
  const IconComponent = step.icon;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-dark-900/90 backdrop-blur-sm"
            onClick={()=> handleSkip(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-dark-700 border border-dark-500 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={()=> handleSkip(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-dark-600/50 hover:bg-dark-500 text-gray-400 hover:text-white transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>

            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-dark-600">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-purple"
                initial={{ width: 0 }}
                animate={{
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Content */}
            <div className="p-6 pt-10">
              {/* Step indicator */}
              <div className="flex justify-center gap-1.5 mb-6">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      index === currentStep
                        ? "w-6 bg-accent"
                        : index < currentStep
                        ? "bg-accent/50"
                        : "bg-dark-500"
                    }`}
                  />
                ))}
              </div>

              {/* Animated step content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="text-center"
                >
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: "spring" }}
                    className={`w-20 h-20 mx-auto rounded-2xl ${step.iconBg} flex items-center justify-center mb-5`}
                  >
                    <IconComponent className={`w-10 h-10 ${step.iconColor}`} />
                  </motion.div>

                  {/* Title */}
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {step.title}
                  </h2>
                  <p className="text-accent text-sm font-medium mb-4">
                    {step.subtitle}
                  </p>

                  {/* Description */}
                  <p className="text-gray-400 text-sm leading-relaxed mb-6 px-4">
                    {step.description}
                  </p>

                  {/* Tips */}
                  <div className="bg-dark-800/50 rounded-xl p-4 text-left space-y-2">
                    {step.tips.map((tip, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-accent text-xs font-bold">
                            {index + 1}
                          </span>
                        </div>
                        <span className="text-gray-300 text-sm">{tip}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between p-6 pt-4 border-t border-dark-600">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  currentStep === 0
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:text-white hover:bg-dark-600"
                }`}
              >
                <FiChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={()=> handleSkip(true)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                >
                  Skip
                </button>

                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-400 hover:from-accent-400 hover:to-accent text-dark-900 font-semibold transition-all shadow-lg shadow-accent/20"
                >
                  {isLastStep ? (
                    <>
                      Get Started
                      <FiAward className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Next
                      <FiChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OnboardingGuide;
