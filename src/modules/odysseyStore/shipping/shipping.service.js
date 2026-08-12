const calculateShipping = async ({ items, subtotal, country = "United States" }) => {
  const isFreeThreshold = subtotal >= 200 || subtotal === 0;

  const methods = [
    {
      id: "express",
      name: "Express Air Shipping (3-5 Business Days)",
      carrier: "DHL Express / FedEx",
      cost: isFreeThreshold ? 0 : 15,
      isFree: isFreeThreshold,
      estimatedDays: "3-5 business days",
      description: "Insured door-to-door tracking with signature confirmation",
    },
    {
      id: "priority-overnight",
      name: "Priority Overnight (1-2 Business Days)",
      carrier: "FedEx Priority",
      cost: 35,
      isFree: false,
      estimatedDays: "1-2 business days",
      description: "Fastest air dispatch with guaranteed morning delivery",
    },
  ];

  return {
    subtotal,
    methods,
    selectedMethod: methods[0],
    shippingFee: methods[0].cost,
  };
};

module.exports = {
  calculateShipping,
};
